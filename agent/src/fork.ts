// Anvil-fork-only helpers. agent.ts creates these only when RPC_URL is 127.0.0.1/localhost.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createTestClient, http, numberToHex, parseEther, publicActions, walletActions, zeroAddress, type Address, type Chain, type Hex } from 'viem'
import { feedAbi, oracleAbi } from './abi.ts'
import { applyPct, envAddress } from './util.ts'

const SNAPSHOT_FILE = join(import.meta.dirname, '..', 'fork', '.snapshot')
const MOCK_ARTIFACT = join(import.meta.dirname, '..', 'fork', 'out', 'MockFeed.sol', 'MockFeed.json')

export function makeFork(rpcUrl: string, chain: Chain) {
  const c = createTestClient({ mode: 'anvil', chain, transport: http(rpcUrl), pollingInterval: 100 })
    .extend(publicActions)
    .extend(walletActions)
  // anvil's unlocked dev accounts: [0] sets prices, [3] liquidates ([1] bucket owner, [2] plain position: ForkSetup.s.sol)
  const devAccount = async (i: number) => (await c.getAddresses())[i]

  // Moves the collateral's (WETH) Aave oracle price by pct percent, compounding on the current price.
  async function price(pct: number) {
    const oracle = envAddress('AAVE_ORACLE')
    const asset = envAddress('COLLATERAL')
    const source = await c.readContract({ address: oracle, abi: oracleAbi, functionName: 'getSourceOfAsset', args: [asset] })
    if (source === zeroAddress) throw new Error('COLLATERAL has no Aave oracle source')
    const before = await c.readContract({ address: oracle, abi: oracleAbi, functionName: 'getAssetPrice', args: [asset] })
    const decimals = await c.readContract({ address: source, abi: feedAbi, functionName: 'decimals' }).catch(() => 8) // Aave USD feeds use 8
    const mock = (JSON.parse(readFileSync(MOCK_ARTIFACT, 'utf8')).deployedBytecode.object as Hex).toLowerCase()
    if ((await c.getCode({ address: source }))?.toLowerCase() !== mock) {
      // Seed the mock's slots (0 = latestAnswer, 1 = decimals) with the live values before swapping the code,
      // so Aave never reads the replaced contract's leftover storage as a price.
      await c.setStorageAt({ address: source, index: 0, value: numberToHex(before, { size: 32 }) })
      await c.setStorageAt({ address: source, index: 1, value: numberToHex(decimals, { size: 32 }) })
      await c.setCode({ address: source, bytecode: mock as Hex })
    }
    const after = applyPct(before, pct)
    const hash = await c.writeContract({ account: await devAccount(0), chain, address: source, abi: feedAbi, functionName: 'set', args: [after, decimals] })
    if ((await c.waitForTransactionReceipt({ hash })).status !== 'success') throw new Error(`set() reverted (${hash})`)
    return { asset, source, decimals, before: before.toString(), price: after.toString(), tx: hash }
  }

  // The demo's reset point. Take it once the fork setup is done (anvil snapshots are single-use, so reset
  // takes a fresh one right after reverting).
  async function snapshot() {
    const id = await c.snapshot()
    writeFileSync(SNAPSHOT_FILE, id)
    return { snapshot: id }
  }

  async function reset() {
    if (!existsSync(SNAPSHOT_FILE)) throw new Error('no reset point yet: POST /fork/snapshot after the fork setup')
    const id = readFileSync(SNAPSHOT_FILE, 'utf8').trim() as Hex
    const ok = await c.request({ method: 'evm_revert', params: [id] } as never)
    if (!ok) throw new Error(`anvil has no snapshot ${id} (new anvil session?): run the fork setup, then POST /fork/snapshot`)
    return { reverted: id, ...(await snapshot()) }
  }

  // Gas money for the keeper's burner on the fork. Reruns after a reset.
  const init = async (keeper?: Address) => {
    if (keeper) await c.setBalance({ address: keeper, value: parseEther('1000') })
  }

  return { price, snapshot, reset, init, liquidator: () => devAccount(3) }
}
