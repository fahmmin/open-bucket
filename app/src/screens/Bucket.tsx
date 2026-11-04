import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import { useAccount, usePublicClient, useReadContracts } from 'wagmi'
import { bucketAbi, erc20Abi, oracleAbi, vaultAbi } from '../abi'
import { AAVE_ORACLE, LENDER, NETWORK_NAME, ORACLE_NAME, POLL_MS, chain } from '../config'
import { loadHistory, useAgentLog, useNow, type AgentLine } from '../chain'
import { explain, fmtCountdown, fmtHf, fmtPct, fmtTime, fmtToken, fmtUsd8, hfNumber, short } from '../format'
import { equityUsd } from '../math'
import { Addr, Chip, HealthRuler, Notice, TxLink, TxStatus, healthTone, txLabel, useTx, useViewAs } from '../ui'
import { RulesFields, parseRules, type RulesInput } from '../market'

type Position = { collateralAmount: bigint; vaultShares: bigint; vaultAssets: bigint; idleDebtAsset: bigint; debt: bigint; healthFactor: bigint }
type Rules = { deadline: bigint; minHealth: bigint; tipBps: number }
type BucketData = {
  address: Address; owner: Address; vault: Address; maxTipBps: number
  cSym: string; cDec: number; dSym: string; dDec: number; vaultName: string; vaultDec?: number
  position: Position; rules: Rules; canExit: { ok: boolean; reason: number }; opened: boolean; closed: boolean
  cPrice?: bigint; dPrice?: bigint
}

export function Bucket({ address }: { address: Address }) {
  const base = useReadContracts({
    contracts: [
      { address, abi: bucketAbi, functionName: 'owner' },
      { address, abi: bucketAbi, functionName: 'collateral' },
      { address, abi: bucketAbi, functionName: 'debtAsset' },
      { address, abi: bucketAbi, functionName: 'vault' },
      { address, abi: bucketAbi, functionName: 'MAX_TIP_BPS' },
    ],
    query: { staleTime: Infinity },
  })
  const live = useReadContracts({
    contracts: [
      { address, abi: bucketAbi, functionName: 'position' },
      { address, abi: bucketAbi, functionName: 'rules' },
      { address, abi: bucketAbi, functionName: 'canExit' },
      { address, abi: bucketAbi, functionName: 'opened' },
      { address, abi: bucketAbi, functionName: 'closed' },
    ],
    query: { refetchInterval: POLL_MS },
  })
  const [owner, coll, debt, vault, maxTip] = (base.data ?? []).map((r) => r.result) as [Address?, Address?, Address?, Address?, number?]
  const meta = useReadContracts({
    contracts: [
      { address: coll!, abi: erc20Abi, functionName: 'symbol' },
      { address: coll!, abi: erc20Abi, functionName: 'decimals' },
      { address: debt!, abi: erc20Abi, functionName: 'symbol' },
      { address: debt!, abi: erc20Abi, functionName: 'decimals' },
      { address: vault!, abi: vaultAbi, functionName: 'name' },
      { address: vault!, abi: vaultAbi, functionName: 'decimals' },
    ],
    query: { enabled: !!(coll && debt && vault), staleTime: Infinity },
  })
  const prices = useReadContracts({
    contracts: [
      { address: AAVE_ORACLE!, abi: oracleAbi, functionName: 'getAssetPrice', args: [coll!] },
      { address: AAVE_ORACLE!, abi: oracleAbi, functionName: 'getAssetPrice', args: [debt!] },
    ],
    query: { enabled: !!(AAVE_ORACLE && coll && debt), refetchInterval: POLL_MS },
  })

  if (base.isLoading || live.isLoading) return <p className="muted" role="status">Loading the bucket.</p>
  const notBucket = base.error ?? base.data?.find((r) => r.status === 'failure')?.error
  if (notBucket)
    return (
      <Notice tone="bad">
        <p>No bucket contract answers at <span className="mono">{address}</span> on {NETWORK_NAME}.</p>
        <p className="small">{explain(notBucket)}</p>
        <p><a href="#discover">Back to Discover</a></p>
      </Notice>
    )
  const liveErr = live.error ?? live.data?.find((r) => r.status === 'failure')?.error
  const [pos, rules, canExit, opened, closed] = (live.data ?? []).map((r) => r.result) as [(readonly bigint[])?, (readonly [bigint, bigint, number])?, (readonly [boolean, number])?, boolean?, boolean?]
  const [cSym, cDec, dSym, dDec, vaultName, vaultDec] = (meta.data ?? []).map((r) => r.result) as [string?, number?, string?, number?, string?, number?]
  if (liveErr || !pos || !rules || !canExit || cDec === undefined || dDec === undefined)
    return liveErr ? <Notice tone="bad">Could not read this bucket: {explain(liveErr)}</Notice> : <p className="muted" role="status">Loading the bucket.</p>

  const data: BucketData = {
    address, owner: owner!, vault: vault!, maxTipBps: maxTip ?? 50,
    cSym: cSym ?? 'collateral', cDec, dSym: dSym ?? 'USDC', dDec, vaultName: vaultName ?? 'Vault', vaultDec,
    position: { collateralAmount: pos[0], vaultShares: pos[1], vaultAssets: pos[2], idleDebtAsset: pos[3], debt: pos[4], healthFactor: pos[5] },
    rules: { deadline: rules[0], minHealth: rules[1], tipBps: rules[2] },
    canExit: { ok: canExit[0], reason: canExit[1] }, opened: !!opened, closed: !!closed,
    cPrice: prices.data?.[0]?.result, dPrice: prices.data?.[1]?.result,
  }
  return <BucketView d={data} />
}

const REASONS: Record<number, string> = { 0: 'the owner', 1: 'deadline passed', 2: 'health below the exit line' }

function BucketView({ d, sample }: { d: BucketData; sample?: boolean }) {
  const { address: connected, isConnected, chainId } = useAccount()
  const viewAs = useViewAs()
  const account = viewAs ?? connected
  const now = useNow()
  const isOwner = !!account && account.toLowerCase() === d.owner.toLowerCase()
  const p = d.position
  const hf = p.healthFactor
  const hfN = hfNumber(hf)
  const equity = d.cPrice !== undefined && d.dPrice !== undefined ? equityUsd(p, d.cPrice, d.dPrice, d.cDec, d.dDec) : undefined
  const shortfall = p.debt > p.vaultAssets + p.idleDebtAsset ? p.debt - p.vaultAssets - p.idleDebtAsset : 0n
  const healthTriggered = (d.canExit.ok && d.canExit.reason === 2) || (d.rules.minHealth > 0n && hf < d.rules.minHealth)
  const deadlineTriggered = (d.canExit.ok && d.canExit.reason === 1) || (d.rules.deadline > 0n && BigInt(now) >= d.rules.deadline)
  const status = d.closed ? 'Closed' : d.opened ? 'Open' : 'Not opened'

  return (
    <>
      {sample && <div className="sample-label" role="note">Sample data</div>}
      <div className="page-head">
        <div className="head-row">
          <div className="stack" style={{ gap: 6 }}>
            <h1>{isOwner ? 'Your bucket' : 'Bucket'}</h1>
            <span className="mono small muted addr-full">{d.address}</span>
          </div>
          <span data-testid="bucket-status" className={`chip ${d.closed ? 'plain' : 'ok'}`}>{status}</span>
        </div>
      </div>
      {d.closed && <Notice>This bucket is closed. The loan was repaid and everything left was sent to the owner. See the history below.</Notice>}

      <div className="screen">
        <div className="bar">
          <span><b>{d.vaultName}</b> route, <Addr a={d.vault} /></span>
          <span>Owner: {isOwner ? 'you' : <Addr a={d.owner} />}</span>
        </div>
        <div className="bucket">
          <div className="left">
            <div className="taccount">
              <div>
                <h3 className="tk">What it holds</h3>
                <div className="row"><span>{d.cSym} on {LENDER}</span><span>{fmtToken(p.collateralAmount, d.cDec)} {d.cSym}</span></div>
                <div className="row"><span>{d.vaultName}</span><span>{fmtToken(p.vaultAssets, d.dDec)} {d.dSym}</span></div>
                {d.vaultDec !== undefined && <div className="row muted small"><span>Vault shares</span><span>{fmtToken(p.vaultShares, d.vaultDec)}</span></div>}
                <div className="row"><span>Exit buffer</span><span>{fmtToken(p.idleDebtAsset, d.dDec)} {d.dSym}</span></div>
              </div>
              <div>
                <h3 className="tk">What it owes</h3>
                <div className="row"><span>{LENDER} loan</span><span>{fmtToken(p.debt, d.dDec)} {d.dSym}</span></div>
              </div>
            </div>
            <div className="equity">
              <span className="muted">Equity, priced by {ORACLE_NAME}</span>
              <span className="big">{equity !== undefined ? fmtUsd8(equity) : AAVE_ORACLE ? 'loading' : 'set VITE_AAVE_ORACLE'}</span>
            </div>
            {shortfall > 0n && !d.closed && (
              <Notice tone="warn">Exit would stop right now: the vault and the buffer are {fmtToken(shortfall, d.dDec)} {d.dSym} short of the loan.</Notice>
            )}
            <div>
              <div className="health-head">
                <h3 className="tk">Health</h3>
                <span className={`value tone-${healthTone(hfN)}`} data-testid="bucket-health">{fmtHf(hf)}</span>
              </div>
              <HealthRuler hf={hf} floor={d.rules.minHealth} />
            </div>
            <div className="rules">
              <h3 className="tk">{isOwner ? 'Your exit rules' : 'Exit rules'}</h3>
              <div className="rule">
                <span>{d.rules.minHealth > 0n ? `Exit if health falls below ${fmtHf(d.rules.minHealth)}` : 'No health rule'}</span>
                {d.rules.minHealth > 0n && <TriggerChip on={healthTriggered} closed={d.closed} />}
              </div>
              <div className="rule">
                <span>{d.rules.deadline > 0n ? <>Exit by {fmtTime(d.rules.deadline)}{BigInt(now) < d.rules.deadline && <span className="muted num">, in {fmtCountdown(Number(d.rules.deadline) - now)}</span>}</> : 'No deadline'}</span>
                {d.rules.deadline > 0n && <TriggerChip on={deadlineTriggered} closed={d.closed} />}
              </div>
              <div className="rule"><span>Tip for the agent</span><span className="num">{fmtPct(d.rules.tipBps / 100)} of the {d.cSym}, at most {fmtPct(d.maxTipBps / 100)}</span></div>
              {!d.closed && d.canExit.ok && <Notice tone="warn">A rule is true ({REASONS[d.canExit.reason] ?? `reason ${d.canExit.reason}`}), so anyone can trigger the exit now.</Notice>}
            </div>
            {!sample && !d.closed && (viewAs
              ? <p className="muted">Read only: exit and rule changes are hidden while viewing another wallet.</p>
              : <Actions d={d} isOwner={isOwner} ready={isConnected && chainId === chain.id} />)}
          </div>
          <div className="right">
            <AgentLog bucket={sample ? undefined : d.address} />
            <History d={d} sample={sample} />
          </div>
        </div>
      </div>
    </>
  )
}

const TriggerChip = ({ on, closed }: { on: boolean; closed: boolean }) =>
  closed ? <Chip tone="plain">Bucket closed</Chip> : on ? <Chip tone="warn">Triggered</Chip> : <Chip tone="ok">Not triggered</Chip>

const toLocalInput = (sec: bigint) => {
  if (sec === 0n) return ''
  const t = new Date(Number(sec) * 1000), z = (n: number) => String(n).padStart(2, '0')
  return `${t.getFullYear()}-${z(t.getMonth() + 1)}-${z(t.getDate())}T${z(t.getHours())}:${z(t.getMinutes())}`
}

function Actions({ d, isOwner, ready }: { d: BucketData; isOwner: boolean; ready: boolean }) {
  const exitTx = useTx()
  const rulesTx = useTx()
  const [editing, setEditing] = useState(false)
  const [rulesIn, setRulesIn] = useState<RulesInput>(() => ({
    floor: d.rules.minHealth > 0n ? fmtHf(d.rules.minHealth) : '',
    deadline: toLocalInput(d.rules.deadline),
    tip: String(d.rules.tipBps / 100),
  }))
  const parsed = parseRules(rulesIn, d.maxTipBps)
  const exitBusy = exitTx.isPending || exitTx.waiting
  const canTrigger = isOwner || d.canExit.ok
  const exit = () => exitTx.writeContract({ address: d.address, abi: bucketAbi, functionName: 'exit' })
  const save = () => { if (!parsed.reason) rulesTx.writeContract({ address: d.address, abi: bucketAbi, functionName: 'setRules', args: [parsed.rules] }) }

  if (!isOwner && !d.canExit.ok) return <p className="muted">Only the owner can exit or change rules now. Anyone can trigger the exit once a rule is true.</p>
  return (
    <div className="stack">
      <div className="btn-row">
        {canTrigger && (
          <button className="btn primary big" type="button" disabled={!ready || exitBusy} onClick={exit}>
            {txLabel(exitTx, isOwner ? 'Exit now' : 'Trigger exit for the tip')}
          </button>
        )}
        {isOwner && <button className="btn" type="button" aria-expanded={editing} onClick={() => setEditing(!editing)}>Edit rules</button>}
        {!ready && <span className="reason">Connect {isOwner ? 'your' : 'a'} wallet on {chain.name} to act.</span>}
      </div>
      <TxStatus tx={exitTx} />
      {editing && isOwner && (
        <form className="form" onSubmit={(e) => { e.preventDefault(); save() }}>
          <RulesFields value={rulesIn} onChange={setRulesIn} maxTipBps={d.maxTipBps} idPrefix="e" />
          <div className="btn-row">
            <button className="btn primary" type="submit" disabled={!ready || !!parsed.reason || rulesTx.isPending || rulesTx.waiting}>{txLabel(rulesTx, 'Save rules')}</button>
            {parsed.reason && <span className="reason">{parsed.reason}</span>}
          </div>
          <TxStatus tx={rulesTx} />
        </form>
      )}
    </div>
  )
}

function agentHealth(h: AgentLine['health']) {
  // The agent already sends health truncated to 2 decimals ("1.42", "Infinity"); show it as sent.
  if (h === null || h === undefined) return 'n/a'
  if (h === 'Infinity') return 'no debt'
  if (typeof h === 'string') return h
  return Number.isFinite(h) ? (Math.floor(h * 100 + 1e-9) / 100).toFixed(2) : 'n/a'
}

function AgentLog({ bucket }: { bucket?: Address }) {
  const { lines, status } = useAgentLog(bucket)
  return (
    <div className="stack">
      <h3 className="tk">Agent log, one line per block</h3>
      {(status === 'offline' || !bucket) && <Notice tone="warn">Agent offline: exits still work, anyone can trigger them.</Notice>}
      {lines.length > 0 ? (
        <ol className="log" aria-live="off">
          {lines.map((l, i) => {
            const act = l.decision ?? 'line'
            const why = l.reason && l.reason !== 'none' ? `, ${l.reason}` : ''
            const tone = act === 'error' || act === 'liquidated' ? 'bad' : act === 'hold' || act === 'confirmed' ? '' : 'go'
            const dl = typeof l.deadlineIn === 'number' ? (l.deadlineIn > 0 ? `, deadline in ${fmtCountdown(l.deadlineIn)}` : ', deadline passed') : ''
            return (
              <li key={`${l.block}-${l.t}-${i}`}>
                <span>#{l.block !== undefined ? Number(l.block).toLocaleString('en-US') : '?'}</span>
                <span>health {agentHealth(l.health)}{dl}{l.error ? `, ${l.error}` : ''}</span>
                <span className={`act ${tone}`}>{act}{why}{l.tx && <> <TxLink hash={l.tx as `0x${string}`} /></>}</span>
              </li>
            )
          })}
        </ol>
      ) : status !== 'offline' && bucket ? <p className="muted">{status === 'connecting' ? 'Connecting to the agent.' : 'Agent connected. No lines for this bucket yet.'}</p> : null}
      <span className="muted small">The agent reads your rules from the contract each block. It can only call exit.</span>
    </div>
  )
}

function History({ d, sample }: { d: BucketData; sample?: boolean }) {
  const client = usePublicClient()
  const q = useQuery({
    queryKey: ['history', d.address, d.closed],
    queryFn: () => loadHistory(client!, d.address, d.closed),
    enabled: !!client && !sample,
    staleTime: Infinity,
  })
  const ownerSaw = (a: Address) => (a.toLowerCase() === d.owner.toLowerCase() ? 'the owner' : `${short(a)}`)
  return (
    <div className="stack">
      <h3 className="tk">History</h3>
      {sample ? <p className="muted">History is not loaded for sample data.</p>
        : q.isLoading ? <p className="muted" role="status">Finding this bucket's transactions.</p>
        : q.error ? <Notice tone="bad">Could not load the history: {explain(q.error)}</Notice>
        : (
          <>
            {q.data?.note && <p className="muted small">{q.data.note}</p>}
            {q.data?.logs.length === 0 && <p className="muted">No events found yet.</p>}
            <ul className="history">
              {q.data?.logs.map((l) => (
                <li key={`${l.transactionHash}-${l.logIndex}`}>
                  <div className="when">
                    <span>{l.eventName === 'RulesSet' ? 'Rules set' : l.eventName}</span>
                    <span className="small muted">{l.timestamp ? fmtTime(l.timestamp) : ''} <span className="mono">#{l.blockNumber?.toLocaleString('en-US')}</span></span>
                  </div>
                  {l.eventName === 'Opened' && <span>Supplied {fmtToken(l.args.collateralAmount!, d.cDec)} {d.cSym}, borrowed {fmtToken(l.args.borrowed!, d.dDec)} {d.dSym}, deposited {fmtToken(l.args.deposited!, d.dDec)} {d.dSym} in the vault.</span>}
                  {l.eventName === 'Exited' && <span>Triggered by {ownerSaw(l.args.caller!)} ({REASONS[l.args.reason!] ?? `reason ${l.args.reason}`}). Repaid {fmtToken(l.args.debtRepaid!, d.dDec)} {d.dSym}. Sent {fmtToken(l.args.collateralToOwner!, d.cDec)} {d.cSym} and {fmtToken(l.args.debtAssetToOwner!, d.dDec)} {d.dSym} to the owner. Tip {fmtToken(l.args.tip!, d.cDec)} {d.cSym}.</span>}
                  {l.eventName === 'RulesSet' && <span>Exit line {l.args.minHealth ? fmtHf(l.args.minHealth) : 'none'}, deadline {l.args.deadline ? fmtTime(l.args.deadline) : 'none'}, tip {fmtPct((l.args.tipBps ?? 0) / 100)}.</span>}
                  {l.transactionHash && <TxLink hash={l.transactionHash} />}
                </li>
              ))}
            </ul>
          </>
        )}
    </div>
  )
}

/** #sample: layout check before contracts exist. Every view of it carries the "Sample data" labels. */
export function SampleBucket() {
  const z = '0x0000000000000000000000000000000000000000' as Address
  const [deadline] = useState(() => BigInt(Math.floor(Date.now() / 1000) + 130))
  const d: BucketData = {
    address: z, owner: z, vault: z, maxTipBps: 50, cSym: 'WETH', cDec: 18, dSym: 'USDC', dDec: 6, vaultName: 'Sample vault', vaultDec: 18,
    position: { collateralAmount: 10n ** 18n, vaultShares: 990n * 10n ** 18n, vaultAssets: 992_400000n, idleDebtAsset: 10_000000n, debt: 1000_310000n, healthFactor: 150n * 10n ** 16n },
    rules: { deadline, minHealth: 115n * 10n ** 16n, tipBps: 10 },
    canExit: { ok: false, reason: 0 }, opened: true, closed: false, cPrice: 2000_00000000n, dPrice: 1_00000000n,
  }
  return <BucketView d={d} sample />
}
