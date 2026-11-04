import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Address, PublicClient } from 'viem'
import { useBlockNumber, usePublicClient, useReadContracts } from 'wagmi'
import { bucketAbi, erc20Abi, oracleAbi, poolAbi } from '../abi'
import { AAVE_ORACLE, AAVE_POOL, AGENT_URL, COLLATERAL, DEMO_BUCKET, IS_FORK, PLAIN_POSITION, POLL_MS, missing } from '../config'
import { explain, fmtHf, fmtPct, fmtPrice8, fmtToken, fmtUsd8, hfNumber } from '../format'
const usd = (amount: bigint, price: bigint | undefined, decimals: number) => (price === undefined ? undefined : (amount * price) / 10n ** BigInt(decimals))
import { liquidationBonusTaken } from '../math'
import { HealthRuler, Notice, TxLink, healthTone } from '../ui'
import { forkStart } from '../chain'

const liquidationCall = poolAbi.find((x) => x.type === 'event' && x.name === 'LiquidationCall')!
const exited = bucketAbi.find((x) => x.type === 'event' && x.name === 'Exited')!

/** Reads LiquidationCall (plain position) and Exited (bucket) logs, with oracle prices at each event's block. */
async function loadCrashLogs(client: PublicClient) {
  const fromBlock = await forkStart(client)
  const [liqs, exits] = await Promise.all([
    client.getLogs({ address: AAVE_POOL!, event: liquidationCall, args: { user: PLAIN_POSITION! }, fromBlock }),
    client.getLogs({ address: DEMO_BUCKET!, event: exited, fromBlock }),
  ])
  const price = (asset: Address, blockNumber: bigint) => client.readContract({ address: AAVE_ORACLE!, abi: oracleAbi, functionName: 'getAssetPrice', args: [asset], blockNumber })
  const liquidations = await Promise.all(liqs.map(async (l) => ({
    ...l, collateralPrice: await price(l.args.collateralAsset!, l.blockNumber), debtPrice: await price(l.args.debtAsset!, l.blockNumber),
  })))
  return { liquidations, exits }
}

export function Crash() {
  const client = usePublicClient()
  const queryClient = useQueryClient()
  const cfgMissing = missing({ VITE_PLAIN_POSITION: PLAIN_POSITION, VITE_DEMO_BUCKET: DEMO_BUCKET, VITE_AAVE_POOL: AAVE_POOL, VITE_AAVE_ORACLE: AAVE_ORACLE })
  const ready = IS_FORK && cfgMissing.length === 0
  const reads = useReadContracts({
    contracts: [
      { address: AAVE_POOL!, abi: poolAbi, functionName: 'getUserAccountData', args: [PLAIN_POSITION!] },
      { address: DEMO_BUCKET!, abi: bucketAbi, functionName: 'position' },
      { address: DEMO_BUCKET!, abi: bucketAbi, functionName: 'rules' },
      { address: DEMO_BUCKET!, abi: bucketAbi, functionName: 'closed' },
      { address: DEMO_BUCKET!, abi: bucketAbi, functionName: 'collateral' },
      { address: DEMO_BUCKET!, abi: bucketAbi, functionName: 'debtAsset' },
    ],
    query: { enabled: ready, refetchInterval: POLL_MS },
  })
  const [acct, pos, rules, closed, collR, debtR] = (reads.data ?? []).map((r) => r.result) as [(readonly bigint[])?, (readonly bigint[])?, (readonly [bigint, bigint, number])?, boolean?, Address?, Address?]
  const coll = collR ?? COLLATERAL
  const tokens = useReadContracts({
    contracts: [
      { address: coll!, abi: erc20Abi, functionName: 'symbol' },
      { address: coll!, abi: erc20Abi, functionName: 'decimals' },
      { address: debtR!, abi: erc20Abi, functionName: 'decimals' },
      { address: AAVE_ORACLE!, abi: oracleAbi, functionName: 'getAssetPrice', args: [coll!] },
      { address: AAVE_ORACLE!, abi: oracleAbi, functionName: 'getAssetPrice', args: [debtR!] },
      { address: AAVE_POOL!, abi: poolAbi, functionName: 'getReserveData', args: [coll!] },
      { address: AAVE_POOL!, abi: poolAbi, functionName: 'getReserveData', args: [debtR!] },
    ],
    query: { enabled: ready && !!coll && !!debtR, refetchInterval: POLL_MS },
  })
  const [cSymR, cDecR, dDecR, priceR, dPriceR, collReserve, debtReserve] = (tokens.data ?? []).map((r) => r.result) as [string?, number?, number?, bigint?, bigint?, { aTokenAddress: Address }?, { variableDebtTokenAddress: Address }?]
  const cSym = cSymR ?? 'WETH', cDec = cDecR ?? 18, dDec = dDecR ?? 6
  // Plain position in token units, like the bucket column: its aToken and variable debt token balances.
  const plain = useReadContracts({
    contracts: [
      { address: collReserve?.aTokenAddress as Address, abi: erc20Abi, functionName: 'balanceOf', args: [PLAIN_POSITION!] },
      { address: debtReserve?.variableDebtTokenAddress as Address, abi: erc20Abi, functionName: 'balanceOf', args: [PLAIN_POSITION!] },
    ],
    query: { enabled: ready && !!collReserve && !!debtReserve, refetchInterval: POLL_MS },
  })
  const [plainColl, plainDebt] = (plain.data ?? []).map((r) => r.result) as [bigint?, bigint?]
  const logs = useQuery({ queryKey: ['crashLogs'], queryFn: () => loadCrashLogs(client!), enabled: ready && !!client, refetchInterval: 2000 })

  // "Start" price: the first read after this screen opened, re-read fresh after any reset.
  const [start, setStart] = useState<bigint>()
  useEffect(() => { if (start === undefined && priceR !== undefined) setStart(priceR) }, [priceR, start])
  const rebaseline = async () => {
    if (!client || !coll || !AAVE_ORACLE) return
    try {
      setStart(await client.readContract({ address: AAVE_ORACLE, abi: oracleAbi, functionName: 'getAssetPrice', args: [coll] }))
    } catch { /* keep the old start; the readout stays honest about its baseline */ }
  }
  // A snapshot revert moves the head back, so a reset from anywhere (this button, a script) re-baselines too.
  const { data: head } = useBlockNumber({ watch: true })
  const lastHead = useRef<bigint>(undefined)
  useEffect(() => {
    if (head === undefined) return
    if (lastHead.current !== undefined && head < lastHead.current) rebaseline()
    lastHead.current = head
  }, [head]) // eslint-disable-line react-hooks/exhaustive-deps
  const [busy, setBusy] = useState<string>()
  const [err, setErr] = useState<string>()
  async function post(path: string, body: object) {
    setBusy(path); setErr(undefined)
    try {
      const r = await fetch(`${AGENT_URL}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      const text = await r.text()
      if (!r.ok) {
        let msg = text.trim()
        try { msg = JSON.parse(text).error ?? msg } catch { /* plain text body */ }
        throw new Error(msg || `HTTP ${r.status}`)
      }
      return true
    } catch (e) {
      setErr(`${AGENT_URL}${path} failed: ${e instanceof Error ? e.message : String(e)}`)
      return false
    } finally {
      setBusy(undefined)
      queryClient.invalidateQueries()
    }
  }
  const reset = async () => { if (await post('/fork/reset', {})) await rebaseline() }

  if (!IS_FORK)
    return <Notice tone="warn">The crash demo only runs against the local fork. Set <code>VITE_RPC_URL=http://127.0.0.1:8545</code> in <code>.env</code> and restart the dev server.</Notice>

  const plainHf = acct?.[5]
  const bucketHf = pos?.[5]
  const floor = rules?.[1]
  const liqs = logs.data?.liquidations ?? []
  const exit = logs.data?.exits[0]
  const bonus = liqs.reduce((sum, l) => sum + liquidationBonusTaken(l.args.liquidatedCollateralAmount!, l.args.debtToCover!, l.collateralPrice, l.debtPrice, cDec, dDec), 0n)
  const bonusUsd = liqs.reduce((sum, l) => sum + (liquidationBonusTaken(l.args.liquidatedCollateralAmount!, l.args.debtToCover!, l.collateralPrice, l.debtPrice, cDec, dDec) * l.collateralPrice) / 10n ** BigInt(cDec), 0n)
  const pN = hfNumber(plainHf), bN = hfNumber(bucketHf)

  const plainStatus = liqs.length > 0 ? { tone: 'bad', text: `Liquidated in ${liqs.length} call${liqs.length > 1 ? 's' : ''}. ${fmtToken(bonus, cDec)} ${cSym} went to the liquidator above the debt it repaid.` }
    : pN !== undefined && pN < 1 ? { tone: 'bad', text: 'Below 1.00. Anyone can liquidate it now.' }
    : pN !== undefined && pN < 1.25 ? { tone: 'warn', text: 'Getting close to liquidation. Nobody is watching it.' }
    : { tone: 'ok', text: 'Healthy. Nobody is watching it.' }
  const bucketStatus = exit ? { tone: 'ok', text: `Exited in block ${exit.blockNumber.toLocaleString('en-US')}. Loan repaid, ${fmtToken(exit.args.collateralToOwner!, cDec)} ${cSym} back to the owner.` }
    : closed ? { tone: 'ok', text: 'Closed. Looking for the exit transaction.' }
    : bucketHf !== undefined && floor ? (bucketHf < floor ? { tone: 'warn', text: 'Below the exit line. The agent exits in the next block.' } : null) : null
  const bucketLine = bucketStatus ?? (bN !== undefined && bN < 1.25 ? { tone: 'warn', text: `Watching. The exit line is ${floor ? fmtHf(floor) : 'not set'}.` }
    : { tone: 'ok', text: 'Healthy. The agent checks it every block.' })

  return (
    <>
      <div className="page-head">
        <h1>The crash: same position, with and without a bucket</h1>
        <p>Both positions were opened with the same amounts on this fork. The price below comes from AaveOracle. The buttons ask our agent to change the oracle price on the fork.</p>
      </div>
      {cfgMissing.length > 0 && <Notice tone="warn">Not configured: {cfgMissing.join(', ')}. The fork setup script prints these values.</Notice>}
      {reads.error && <Notice tone="bad">Could not read the fork: {explain(reads.error)}</Notice>}

      <div className="screen">
        <div className="crash-top">
          <div className="stack" style={{ gap: 2 }}>
            <span className="muted">{cSym} price, AaveOracle</span>
            <span className="price">{priceR !== undefined ? fmtPrice8(priceR) : 'loading'}</span>
            {priceR !== undefined && start !== undefined && start > 0n && (
              <span className="muted small">{fmtPct((Number(priceR) / Number(start)) * 100, 1)} of the price when this screen opened or was reset</span>
            )}
          </div>
          <div className="btn-row">
            <button className="btn primary big" type="button" disabled={!!busy || !ready} onClick={() => post('/fork/price', { pct: -4 })}>{busy === '/fork/price' ? 'Dropping' : 'Drop price 4%'}</button>
            <button className="btn big" type="button" disabled={!!busy || !ready} onClick={reset}>{busy === '/fork/reset' ? 'Resetting' : 'Reset'}</button>
          </div>
        </div>
        {err && <div className="pad" style={{ paddingBottom: 0 }}><Notice tone="bad">{err}</Notice></div>}
        <div className="duo">
          <div>
            <h2>Plain Aave position</h2>
            <div className="health-head"><span className="muted">Health</span><span className={`value tone-${healthTone(pN)}`}>{fmtHf(plainHf)}</span></div>
            <HealthRuler hf={plainHf} />
            <p className={`status ${plainStatus.tone}`} role="status">{plainStatus.text}</p>
            <dl className="kv">
              <dt>Collateral</dt><dd>{plainColl !== undefined ? `${fmtToken(plainColl, cDec)} ${cSym}` : 'n/a'}{acct && <span className="sub">{fmtUsd8(acct[0])}</span>}</dd>
              <dt>Debt</dt><dd>{plainDebt !== undefined ? `${fmtToken(plainDebt, dDec)} USDC` : 'n/a'}{acct && <span className="sub">{fmtUsd8(acct[1])}</span>}</dd>
            </dl>
          </div>
          <div>
            <h2>Same position in a bucket</h2>
            <div className="health-head"><span className="muted">Health</span><span className={`value tone-${healthTone(bN)}`}>{fmtHf(bucketHf)}</span></div>
            <HealthRuler hf={bucketHf} floor={floor} floorLabel="exit line" />
            <p className={`status ${bucketLine.tone}`} role="status">{bucketLine.text}</p>
            <dl className="kv">
              <dt>Collateral</dt><dd>{pos ? `${fmtToken(pos[0], cDec)} ${cSym}` : 'n/a'}{pos && usd(pos[0], priceR, cDec) !== undefined && <span className="sub">{fmtUsd8(usd(pos[0], priceR, cDec)!)}</span>}</dd>
              <dt>Debt</dt><dd>{pos ? `${fmtToken(pos[4], dDec)} USDC` : 'n/a'}{pos && usd(pos[4], dPriceR, dDec) !== undefined && <span className="sub">{fmtUsd8(usd(pos[4], dPriceR, dDec)!)}</span>}</dd>
            </dl>
          </div>
        </div>
        {logs.error && <div className="pad"><Notice tone="bad">Could not read the events: {explain(logs.error)}</Notice></div>}
        {(liqs.length > 0 || exit) && (
          <div className="verdict" aria-live="polite">
            <span>Same crash.</span>
            {liqs.length > 0 && <span>The plain position lost {fmtToken(bonus, cDec)} {cSym} ({fmtUsd8(bonusUsd)} at the liquidation price) to the liquidation bonus.</span>}
            {exit && <span>The bucket paid a {fmtToken(exit.args.tip!, cDec)} {cSym} tip, repaid {fmtToken(exit.args.debtRepaid!, dDec)} USDC and returned {fmtToken(exit.args.collateralToOwner!, cDec)} {cSym} to the owner.</span>}
            <span className="small muted">From the LiquidationCall and Exited events on this fork:{' '}
              {liqs.map((l) => <TxLink key={l.transactionHash} hash={l.transactionHash} />)}{exit && <> <TxLink hash={exit.transactionHash} /></>}
            </span>
          </div>
        )}
      </div>
    </>
  )
}
