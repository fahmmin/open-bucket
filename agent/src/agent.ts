// Open Bucket keeper ("agent"). Every block, ONE Multicall3 batch reads the factory's bucket list, every open
// bucket (position, rules, closed, canExit) and, if the liquidator is on, the plain Aave position. Any bucket
// whose canExit() is true onchain gets exit(), once. Serves /events (SSE), /health, /yields and the
// fork/testnet demo endpoints. See README.md.
import http from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { createPublicClient, createWalletClient, http as httpTransport, isAddress, nonceManager, webSocket, type Account, type Address, type Chain, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { monad, monadTestnet } from 'viem/chains'
import { bucketAbi, factoryAbi, multicall3Abi, oracleAbi, poolAbi, testOracleAbi } from './abi.ts'
import { decide } from './decide.ts'
import { makeFork } from './fork.ts'
import { makeLiquidator } from './liquidator.ts'
import { applyPct, envAddress, errMsg, fmtHealth, mined, sendTx, type AgentEvent } from './util.ts'

const envFile = join(import.meta.dirname, '..', '.env')
if (existsSync(envFile)) process.loadEnvFile(envFile)
const env = process.env

// ---- config ----
const CHAIN_ID = Number(env.CHAIN_ID || 143)
const chain = ({ 143: monad, 10143: monadTestnet } as Record<number, Chain>)[CHAIN_ID]
if (!chain) throw new Error('CHAIN_ID must be 143 (Monad mainnet) or 10143 (Monad testnet)')
const RPC_URL = env.RPC_URL || chain.rpcUrls.default.http[0]
const WS_URL = env.WS_URL
const IS_FORK = ['127.0.0.1', 'localhost'].includes(new URL(RPC_URL).hostname) // a local anvil
const POLL_MS = IS_FORK ? 250 : 400 // public RPCs: at most one poll per 400 ms
const DRY_RUN = env.DRY_RUN === '1'
const PORT = Number(env.PORT || 8787)
const MULTICALL3 = '0xcA11bde05977b3631167028862bE2a173976CA11'

// Aave V3 Monad and tokens, VERIFIED in docs/onchain-facts.md. Mainnet and its fork only; testnet sets its own.
if (CHAIN_ID === 143) {
  env.AAVE_POOL ||= '0x69a5F9AD4f96ebf0a0C792dD42a01cC5C0102fef'
  env.AAVE_ORACLE ||= '0x0c02b2c2038066C10Eab8fe1D5Cdb73d5a78A1Bf'
  env.COLLATERAL ||= '0xEE8c0E9f1BFFb4Eb878d8f15f368A02a35481242' // WETH (WMON is not an Aave Monad reserve)
  env.USDC ||= '0x754704Bc059F8C67012fEd69BC8A327a5aafb603'
}
// On the fork, contracts/script/ForkSetup.s.sol writes the demo addresses; they beat stale .env values.
const demoFile = join(import.meta.dirname, '..', '..', 'contracts', 'fork-demo.json')
if (IS_FORK && existsSync(demoFile)) {
  const d = JSON.parse(readFileSync(demoFile, 'utf8'))
  if (isAddress(String(d.factory))) env.FACTORY = d.factory
  if (isAddress(String(d.plainPosition))) env.PLAIN_POSITION = d.plainPosition
  if (isAddress(String(d.collateral))) env.COLLATERAL = d.collateral // an address in newer versions, an amount in older
  console.log(`fork: using contracts/fork-demo.json (factory ${env.FACTORY}, plainPosition ${env.PLAIN_POSITION})`)
}
const FACTORY = env.FACTORY ? envAddress('FACTORY') : undefined

function keyAccount(name: string): Account | undefined {
  const v = env[name]
  if (!v) return undefined
  try {
    return privateKeyToAccount(v as Hex, { nonceManager })
  } catch {
    throw new Error(`${name} is not a 0x-prefixed 32-byte hex key`) // never echo a key
  }
}
const keeper = DRY_RUN ? undefined : keyAccount('PRIVATE_KEY')
if (!DRY_RUN && !keeper) throw new Error('PRIVATE_KEY is required unless DRY_RUN=1')
const oracleAdmin = CHAIN_ID === 10143 ? keyAccount('ORACLE_ADMIN_KEY') : undefined

const transport = httpTransport(RPC_URL)
const client = createPublicClient({ chain, transport, pollingInterval: POLL_MS })
const walletFor = (account: Account | Address) => createWalletClient({ account, chain, transport })
const fork = IS_FORK ? makeFork(RPC_URL, chain) : undefined

// Plain-position liquidator: fork (anvil dev account #3) or testnet (LIQUIDATOR_KEY). Never on mainnet.
const LIQUIDATE = env.LIQUIDATE_PLAIN === '1' && !!env.PLAIN_POSITION && (IS_FORK || CHAIN_ID === 10143)
if (env.LIQUIDATE_PLAIN === '1' && !LIQUIDATE) console.warn('LIQUIDATE_PLAIN ignored: needs PLAIN_POSITION and the fork or testnet')
const liqKey = LIQUIDATE && !IS_FORK ? keyAccount('LIQUIDATOR_KEY') : undefined
if (LIQUIDATE && !IS_FORK && !liqKey) throw new Error('LIQUIDATE_PLAIN=1 on testnet needs LIQUIDATOR_KEY')
const PLAIN = LIQUIDATE ? envAddress('PLAIN_POSITION') : undefined
const POOL = LIQUIDATE ? envAddress('AAVE_POOL') : undefined
const liquidator = LIQUIDATE
  ? makeLiquidator(
      client,
      async () => walletFor(liqKey ?? (await fork!.liquidator())),
      { pool: POOL!, oracle: envAddress('AAVE_ORACLE'), collateral: envAddress('COLLATERAL'), usdc: envAddress('USDC'), user: PLAIN! },
      emit,
    )
  : undefined

// ---- SSE log: ring buffer of the last 50 events, replayed to each new client ----
const ring: object[] = []
const sseClients = new Set<http.ServerResponse>()
function emit(ev: AgentEvent) {
  const e = { t: Date.now(), ...ev }
  ring.push(e)
  if (ring.length > 50) ring.shift()
  for (const res of sseClients) res.write(`data: ${JSON.stringify(e)}\n\n`)
  const extra = [ev.reason && ev.reason !== 'none' && ev.reason, ev.tx && `tx=${ev.tx}`, ev.error && `error=${ev.error}`]
  console.log(`#${ev.block} ${ev.bucket} health=${ev.health} deadlineIn=${ev.deadlineIn} ${ev.decision}`, ...extra.filter(Boolean))
}

// ---- keeper ----
let known: readonly Address[] = [] // factory.allBuckets(), refreshed inside every block's batch
const done = new Set<Address>() // seen closed: single-use, never read again (cleared by a fork reset)
const inFlight = new Set<Address>() // exit sent or confirmed; cleared on failure so the next block retries
let head = 0n // last block processed
let lastOkAt = 0
let busy = false
let backoff = 0
let pauseUntil = 0

async function tick(n: bigint) {
  // First block (and after a fork reset): read the list now instead of a block later (an idle anvil may not mine one).
  if (FACTORY && head === 0n) known = await client.readContract({ address: FACTORY, abi: factoryAbi, functionName: 'allBuckets' })
  const list = known.filter((b) => !done.has(b))
  const calls: any[] = [{ address: MULTICALL3, abi: multicall3Abi, functionName: 'getCurrentBlockTimestamp' }]
  if (FACTORY) calls.push({ address: FACTORY, abi: factoryAbi, functionName: 'allBuckets' })
  if (LIQUIDATE) calls.push({ address: POOL, abi: poolAbi, functionName: 'getUserAccountData', args: [PLAIN] })
  const fns = ['position', 'rules', 'closed', 'canExit']
  for (const address of list) for (const functionName of fns) calls.push({ address, abi: bucketAbi, functionName })
  const res: any[] = await client.multicall({ multicallAddress: MULTICALL3, batchSize: 0, contracts: calls }) // one eth_call
  const ts = res.shift()
  const all = FACTORY ? res.shift() : undefined
  const plain = LIQUIDATE ? res.shift() : undefined
  if (ts.status !== 'success') throw ts.error
  if (all && all.status !== 'success') throw all.error // wrong FACTORY or RPC trouble: back off
  if (all) known = all.result // new buckets join the next block's batch
  const now = ts.result as bigint // the block.timestamp canExit() saw
  const block = Number(n)

  list.forEach((bucket, i) => {
    const [pos, rules, closed, can] = res.slice(i * 4, i * 4 + 4)
    if (closed.status === 'success' && closed.result) return void done.add(bucket)
    const failed = [pos, rules, closed, can].find((r) => r.status !== 'success')
    if (failed) return emit({ block, bucket, health: null, deadlineIn: null, decision: 'error', error: errMsg(failed.error) })
    const [, , , , debt, health] = pos.result as bigint[]
    const [deadline, minHealth] = rules.result as bigint[]
    const [ok] = can.result as [boolean, number]
    const d = decide({ health, debt }, { deadline, minHealth }, now)
    if ((d.action === 'exit') !== ok) console.warn(`${bucket}: decide() says ${d.action} but canExit().ok is ${ok}; following the contract`)
    const ev = { block, bucket, health: fmtHealth(health), deadlineIn: deadline === 0n ? null : Number(deadline - now), reason: d.reason }
    emit({ ...ev, decision: d.action })
    if (ok && keeper && !inFlight.has(bucket)) void sendExit(ev)
  })

  if (plain?.status === 'failure') emit({ block, bucket: PLAIN!, health: null, deadlineIn: null, decision: 'error', error: errMsg(plain.error) })
  else if (plain && !DRY_RUN) void liquidator!.check(block, plain.result[1], plain.result[5]) // totalDebtBase, healthFactor
}

// exit() at most once per bucket (sendTx: gas = estimate * 1.2).
async function sendExit(ev: Omit<AgentEvent, 'decision'>) {
  const address = ev.bucket as Address
  inFlight.add(address)
  let tx: Hex | undefined
  try {
    tx = await sendTx(client, walletFor(keeper!), { address, abi: bucketAbi, functionName: 'exit' })
    emit({ ...ev, decision: 'sent', tx })
    const r = await mined(client, tx)
    emit({ ...ev, block: Number(r.blockNumber), decision: 'confirmed', tx })
  } catch (e) {
    inFlight.delete(address)
    emit({ ...ev, decision: 'error', tx, error: errMsg(e) })
  }
}

// ---- block source: websocket if WS_URL, else (or when the socket fails) HTTP polling; errors back off to 15 s ----
function fail(e: unknown) {
  backoff = Math.min(backoff ? backoff * 2 : 500, 15_000)
  pauseUntil = Date.now() + backoff
  console.error(`block ${head + 1n}: ${errMsg(e)}; retrying in ${backoff} ms`)
}

async function onBlock(n: bigint) {
  if (n <= head) return void (lastOkAt = Date.now()) // no new block (an automining anvil idles): still healthy
  if (busy || Date.now() < pauseUntil) return
  busy = true
  try {
    await tick(n)
    head = n
    lastOkAt = Date.now()
    backoff = 0
  } catch (e) {
    fail(e)
  } finally {
    busy = false
  }
}

let polling = false
async function poll() {
  if (polling) return
  polling = true
  for (;;) {
    if (Date.now() >= pauseUntil) await client.getBlockNumber({ cacheTime: 0 }).then(onBlock, fail)
    await sleep(POLL_MS)
  }
}

// One-time setup (fork: keeper gas money; liquidator: USDC loan). Never sends in DRY_RUN.
async function init() {
  if (fork) await fork.init(keeper?.address)
  if (liquidator && !DRY_RUN) await liquidator.prepare()
}

// After an anvil evm_revert the chain (and our nonce) went back in time: forget what we saw, then re-init.
async function forkReset() {
  pauseUntil = Infinity // no tick may straddle the revert
  while (busy) await sleep(20)
  try {
    return await fork!.reset()
  } finally {
    ring.length = 0 // the chain rewound: never replay pre-reset blocks to new clients
    done.clear()
    inFlight.clear()
    head = 0n
    pauseUntil = 0
    if (keeper?.nonceManager) keeper.nonceManager.reset({ address: keeper.address, chainId: chain.id })
    init().catch((e) => console.error(`init after reset: ${errMsg(e)}`))
  }
}

// Backup crash demo on testnet: our TestOracle lets its owner set prices.
async function testnetPrice(pct: number) {
  const oracle = envAddress('AAVE_ORACLE')
  const asset = envAddress('COLLATERAL')
  const before = await client.readContract({ address: oracle, abi: oracleAbi, functionName: 'getAssetPrice', args: [asset] })
  const price = applyPct(before, pct)
  const tx = await sendTx(client, walletFor(oracleAdmin!), { address: oracle, abi: testOracleAbi, functionName: 'setAssetPrice', args: [asset, price] })
  await mined(client, tx)
  return { asset, before: before.toString(), price: price.toString(), tx }
}

// ---- DefiLlama yields, Monad only, cached 10 minutes; failures are not cached ----
let yields: { at: number; p: Promise<unknown[]> } | undefined
function getYields() {
  if (!yields || Date.now() - yields.at > 600_000) {
    const p = fetch('https://yields.llama.fi/pools', { signal: AbortSignal.timeout(30_000) })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<{ data: { chain: string }[] }>
      })
      .then((j) => j.data.filter((pool) => pool.chain === 'Monad'))
    yields = { at: Date.now(), p }
    p.catch(() => yields?.p === p && (yields = undefined))
  }
  return yields.p
}

// ---- HTTP ----
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/
const json = (res: http.ServerResponse, status: number, body: unknown) =>
  res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body))

async function readPct(req: http.IncomingMessage) {
  let s = ''
  for await (const chunk of req) if ((s += chunk).length > 10_000) return undefined
  try {
    const { pct } = JSON.parse(s)
    return typeof pct === 'number' && pct > -100 && pct < 1000 ? pct : undefined
  } catch {
    return undefined
  }
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin
  if (origin && LOCAL_ORIGIN.test(origin)) res.setHeader('access-control-allow-origin', origin)
  const route = `${req.method} ${new URL(req.url ?? '/', 'http://localhost').pathname}`
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'access-control-allow-methods': 'GET, POST', 'access-control-allow-headers': 'content-type' }).end()
    } else if (route === 'GET /events') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' })
      for (const e of ring) res.write(`data: ${JSON.stringify(e)}\n\n`)
      sseClients.add(res)
      req.on('close', () => sseClients.delete(res))
    } else if (route === 'GET /health') {
      json(res, 200, { ok: Date.now() - lastOkAt < 10_000, block: Number(head), buckets: known.filter((b) => !done.has(b)).length, dryRun: DRY_RUN })
    } else if (route === 'GET /yields') {
      try {
        json(res, 200, await getYields())
      } catch (e) {
        json(res, 502, { error: `DefiLlama yields unavailable: ${errMsg(e)}` })
      }
    } else if (route.startsWith('POST /fork/')) {
      if (!fork) return json(res, 403, { error: 'fork endpoints only work when RPC_URL is on 127.0.0.1 or localhost (anvil)' })
      if (route === 'POST /fork/reset') return json(res, 200, await forkReset())
      if (route === 'POST /fork/snapshot') return json(res, 200, await fork.snapshot())
      if (route !== 'POST /fork/price') return json(res, 404, { error: 'not found' })
      const pct = await readPct(req)
      if (pct === undefined) return json(res, 400, { error: 'body must be {"pct": number} with -100 < pct < 1000' })
      json(res, 200, await fork.price(pct))
    } else if (route === 'POST /testnet/price') {
      if (!oracleAdmin) return json(res, 403, { error: 'testnet price control needs CHAIN_ID=10143 and ORACLE_ADMIN_KEY' })
      const pct = await readPct(req)
      if (pct === undefined) return json(res, 400, { error: 'body must be {"pct": number} with -100 < pct < 1000' })
      json(res, 200, await testnetPrice(pct))
    } else {
      json(res, 404, { error: 'not found' })
    }
  } catch (e) {
    json(res, 500, { error: errMsg(e) })
  }
})

// Loopback only: the POST endpoints have no auth, so keep them off the venue Wi-Fi.
server.listen(PORT, '127.0.0.1', () => {
  const mode = DRY_RUN ? 'DRY RUN (never sends)' : `LIVE, keeper ${keeper!.address}`
  const where = `${chain.name} (${chain.id}) via ${new URL(RPC_URL).host}${IS_FORK ? ' [anvil fork]' : ''}${WS_URL ? ` + ws ${new URL(WS_URL).host}` : ''}`
  console.log(`agent on http://localhost:${PORT} | ${where} | factory ${FACTORY ?? 'none'} | ${mode}${LIQUIDATE ? ` | liquidating ${PLAIN}` : ''}`)
})

init().catch((e) => console.error(`init: ${errMsg(e)}`))
if (WS_URL) {
  createPublicClient({ chain, transport: webSocket(WS_URL) }).watchBlockNumber({
    emitOnBegin: true,
    onBlockNumber: (n) => void onBlock(n),
    onError: (e) => {
      fail(e)
      void poll() // keep running on HTTP if the socket fails or never connects
    },
  })
} else {
  void poll()
}
