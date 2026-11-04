import { Fragment, useEffect, useState } from 'react'
import { formatUnits, parseEventLogs, type Address } from 'viem'
import { useAccount, useConnect, useReadContracts, useSwitchChain } from 'wagmi'
import { erc20Abi, factoryAbi, testWethAbi } from '../abi'
import { AAVE_ORACLE, AAVE_POOL, COLLATERAL, FACTORY, IS_TESTNET, LENDER, LENDER_REF, ORACLE_NAME, POLL_MS, SPEC_MAX_TIP_BPS, USDC, chain, missing } from '../config'
import { explain, fmtHf, fmtPct, fmtPrice8, fmtToken, fmtUsd8, short } from '../format'
import { borrowLimits, healthAfterOpen, liquidationPrice } from '../math'
import { RulesFields, earnsLabel, parse, parseRules, useMarket, useVaultBoard, type MarketInfo, type RulesInput, type VaultRow } from '../market'
import { EXIT_CHECKED } from '../vaults'
import { Addr, Chip, Notice, TxStatus, txLabel, useTx, useViewAs } from '../ui'

const SPEED = { Instant: 0, Limited: 1, Slow: 2 } as const
const nf2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Routes you can open first, then by the chosen tab: net yield, or exit speed then net yield. */
export function sortRoutes(rows: VaultRow[], tab: 'yield' | 'exit') {
  const net = (r: VaultRow) => r.net ?? -1e9
  return [...rows].sort((a, b) => Number(!!a.viewOnly) - Number(!!b.viewOnly) || (tab === 'exit' ? SPEED[a.exit] - SPEED[b.exit] : 0) || net(b) - net(a))
}

/** Estimated USD a year: vault yield on what goes in, minus the borrow cost on all of the loan. */
export function yearlyUsd(row: VaultRow, mk: MarketInfo | undefined, borrow: bigint | undefined, buffer?: bigint) {
  if (!mk || row.apy === undefined) return undefined
  const b = Number(formatUnits(borrow ?? 1000n * 10n ** BigInt(mk.debtDecimals), mk.debtDecimals))
  const buf = buffer !== undefined ? Number(formatUnits(buffer, mk.debtDecimals)) : b / 100
  return (((b - buf) * row.apy - b * mk.borrowApr) / 100) * (Number(mk.debtPrice) / 1e8)
}

/** Big money figure with the cents dimmed, like the plan's "100.02|15". */
export function Money({ usd, sign = true }: { usd: number; sign?: boolean }) {
  const s = `${usd < 0 ? '-' : sign ? '+' : ''}$${nf2.format(Math.abs(usd))}`
  const i = s.lastIndexOf('.')
  return <span className="money">{s.slice(0, i)}<span className="dim">{s.slice(i)}</span></span>
}

export function ExitChip({ row }: { row: VaultRow }) {
  const tone = row.exit === 'Instant' ? 'ok' : row.exit === 'Limited' ? 'warn' : 'bad'
  return <span className={`chip ${tone}`} title={`${row.exitNote}. ${EXIT_CHECKED}.`}>Exit: {row.exit.toLowerCase()}</span>
}

const cents = (v: bigint, decimals: number) => v - (v % 10n ** BigInt(Math.max(0, decimals - 2)))

/** Health 1.50 is the default loan: borrow that much, capped by the lender's max loan-to-value, rounded down to cents. */
function borrowForHealth150(mk: MarketInfo, collateral: bigint) {
  const { byLtv, byFloor } = borrowLimits(mk, collateral, 15n * 10n ** 17n)
  return cents(byFloor !== undefined && byFloor < byLtv ? byFloor : byLtv, mk.debtDecimals)
}

export function Discover() {
  const { market: mk, error } = useMarket()
  const board = useVaultBoard(mk)
  const [tab, setTab] = useState<'yield' | 'exit'>('yield')
  const [picked, setPicked] = useState<Address>()
  const [amount, setAmount] = useState('')
  const [borrow, setBorrow] = useState<string | null>(null) // null = follow health 1.50
  const [buffer, setBuffer] = useState<string | null>(null) // null = 1% of the borrow
  const rows = sortRoutes(board.rows, tab)
  const route = rows.find((r) => r.address === picked && !r.viewOnly) ?? rows[0]
  const c = mk?.collateralDecimals ?? 18, d = mk?.debtDecimals ?? 6
  const collateral = parse(amount, c)
  const auto = mk && collateral ? borrowForHealth150(mk, collateral) : undefined
  const borrowAmt = borrow === null ? auto : parse(borrow, d)
  const autoBuffer = borrowAmt ? cents(borrowAmt / 100n, d) : undefined
  const bufferAmt = buffer === null ? autoBuffer : parse(buffer, d)
  const cfgMissing = missing({ VITE_FACTORY: FACTORY, VITE_AAVE_POOL: AAVE_POOL, VITE_AAVE_ORACLE: AAVE_ORACLE, VITE_USDC: USDC, VITE_COLLATERAL: COLLATERAL })

  return (
    <>
      <div className="page-head">
        <h1>Where should your borrowed dollars go?</h1>
        <p>Supply WETH, borrow USDC against it, and park the USDC in a vault. The routes on the right compare every vault we know on Monad, after the borrow cost.</p>
      </div>
      {cfgMissing.length > 0 && <Notice tone="warn">Not configured yet: {cfgMissing.map((k, i) => <Fragment key={k}>{i > 0 && ', '}<code>{k}</code></Fragment>)}.</Notice>}
      {error && <Notice tone="bad">Could not read the {LENDER} market: {explain(error)}</Notice>}
      <div className="discover">
        <OpenPanel mk={mk} route={route} amount={amount} setAmount={setAmount} borrow={borrow ?? (auto !== undefined ? formatUnits(auto, d) : '')}
          setBorrow={setBorrow} isAuto={borrow === null} collateral={collateral} borrowAmt={borrowAmt}
          buffer={buffer ?? (autoBuffer !== undefined ? formatUnits(autoBuffer, d) : '')} setBuffer={setBuffer} bufferAmt={bufferAmt} />
        <RoutesPanel rows={rows} route={route} onPick={setPicked} tab={tab} setTab={setTab} mk={mk} borrowAmt={borrowAmt} bufferAmt={bufferAmt} loading={board.loading} yieldsError={board.yields.error} />
      </div>
    </>
  )
}

function OpenPanel(p: {
  mk?: MarketInfo; route?: VaultRow; amount: string; setAmount: (s: string) => void; borrow: string; setBorrow: (s: string) => void
  isAuto: boolean; collateral?: bigint; borrowAmt?: bigint; buffer: string; setBuffer: (s: string) => void; bufferAmt?: bigint
}) {
  const { mk, route, collateral, borrowAmt, bufferAmt } = p
  const viewAs = useViewAs()
  const { address, isConnected, chainId } = useAccount()
  const { connect, connectors, isPending: connecting } = useConnect()
  const { switchChain, isPending: switching } = useSwitchChain()
  const [rulesIn, setRulesIn] = useState<RulesInput>({ floor: '1.15', deadline: '', tip: '0.1' })
  const approveTx = useTx(), openTx = useTx(), faucetTx = useTx()
  const token = mk?.collateralToken ?? COLLATERAL
  const wallet = useReadContracts({
    contracts: [
      { address: token!, abi: erc20Abi, functionName: 'balanceOf', args: [address!] },
      { address: token!, abi: erc20Abi, functionName: 'allowance', args: [address!, FACTORY!] },
    ],
    query: { enabled: !!(address && FACTORY && token), refetchInterval: POLL_MS },
  })
  const balance = wallet.data?.[0]?.result
  const allowance = wallet.data?.[1]?.result
  const c = mk?.collateralDecimals ?? 18, d = mk?.debtDecimals ?? 6
  const cSym = mk?.cSym ?? 'WETH'
  const { rules, reason: rulesReason } = parseRules(rulesIn, SPEC_MAX_TIP_BPS)
  const hf = mk && collateral && borrowAmt ? healthAfterOpen(mk, collateral, borrowAmt) : undefined
  const liq = mk && collateral && borrowAmt ? liquidationPrice(mk, collateral, borrowAmt) : undefined
  const limits = mk && collateral ? borrowLimits(mk, collateral, rules.minHealth) : undefined
  const safe = limits && (limits.byFloor !== undefined && limits.byFloor < limits.byLtv ? limits.byFloor : limits.byLtv)
  const approved = collateral !== undefined && allowance !== undefined && allowance >= collateral
  const settling = approveTx.receipt?.status === 'success' && !approved // allowance read not refreshed yet

  // Checked before step 1 too, so "Approve WETH" is never offered for a loan the lender will refuse.
  const limitReason = collateral && borrowAmt && limits && borrowAmt > limits.byLtv
    ? `${LENDER} lends at most ${fmtToken(limits.byLtv, d)} USDC against ${fmtToken(collateral, c)} ${cSym}.` : undefined
  let approveReason: string | undefined
  if (!FACTORY) approveReason = 'No Open Bucket factory is set up yet, so nothing can be opened.'
  else if (!mk) approveReason = `Waiting for ${LENDER} market data.`
  else if (mk.ltv === 0n || mk.frozen) approveReason = `${LENDER} does not take new ${cSym} collateral right now.`
  else if (!route) approveReason = 'Pick a route on the right.'
  else if (route.viewOnly) approveReason = `This route is view only. ${route.viewOnly}`
  else if (!collateral) approveReason = `Enter how much ${cSym} to supply.`
  else if (balance !== undefined && collateral > balance) approveReason = `Your wallet has ${fmtToken(balance, c)} ${cSym}.`
  else if (limitReason) approveReason = limitReason
  let openReason = approveReason
  if (!openReason && mk && collateral) {
    if (!borrowAmt) openReason = 'Enter how much USDC to borrow.'
    else if (rulesReason) openReason = rulesReason
    else if (rules.minHealth > 0n && hf !== undefined && hf <= rules.minHealth) openReason = `This loan would start at health ${fmtHf(hf)}, at or below your exit line, so anyone could exit it at once. Borrow at most ${fmtToken(safe ?? 0n, d)} USDC.`
    else if (bufferAmt === undefined) openReason = 'The exit buffer must be a USDC amount.'
    else if (bufferAmt >= borrowAmt) openReason = 'The exit buffer must be smaller than the borrow.'
  }
  const step = !isConnected ? 'connect' : chainId !== chain.id ? 'switch' : !approved ? 'approve' : 'open'
  const busy = approveTx.isPending || approveTx.waiting || openTx.isPending || openTx.waiting || settling
  const stepReason = step === 'approve' ? approveReason : step === 'open' ? openReason : undefined
  const label = step === 'connect' ? (connecting ? 'Check your wallet' : 'Connect a wallet')
    : step === 'switch' ? (switching ? 'Check your wallet' : `Switch to ${chain.name}`)
    : step === 'approve' ? (settling ? 'Waiting for confirmation' : txLabel(approveTx, 'Approve WETH'))
    : txLabel(openTx, 'Open bucket')

  const created = openTx.receipt ? parseEventLogs({ abi: factoryAbi, logs: openTx.receipt.logs, eventName: 'Created' })[0]?.args.bucket : undefined
  useEffect(() => { if (created) window.location.hash = `#bucket-${created}` }, [created])
  useEffect(() => { if (approveTx.receipt) wallet.refetch() }, [approveTx.receipt]) // eslint-disable-line react-hooks/exhaustive-deps

  const submit = () => {
    if (step === 'connect') return connect({ connector: connectors[0] })
    if (step === 'switch') return switchChain({ chainId: chain.id })
    if (stepReason || !collateral || busy) return
    if (step === 'approve') return approveTx.writeContract({ address: token!, abi: erc20Abi, functionName: 'approve', args: [FACTORY!, collateral] })
    if (!borrowAmt || bufferAmt === undefined || !route) return
    openTx.writeContract({ address: FACTORY!, abi: factoryAbi, functionName: 'createAndOpen', args: [token!, route.address, collateral, borrowAmt, bufferAmt, rules], value: 0n })
  }
  const words = hf === undefined ? { text: 'Health after: enter an amount', tone: '' }
    : rules.minHealth > 0n && hf <= rules.minHealth ? { text: `Health after: ${fmtHf(hf)}, below your exit line`, tone: 'bad' }
    : hf < 125n * 10n ** 16n ? { text: `Health after: ${fmtHf(hf)}, risky`, tone: 'warn' }
    : { text: `Health after: ${fmtHf(hf)}, safe`, tone: 'ok' }
  const dropPct = liq !== undefined && mk ? (1 - Number(liq) / Number(mk.collateralPrice)) * 100 : undefined

  return (
    <form className="card swap" data-testid="open-form" onSubmit={(e) => { e.preventDefault(); submit() }} aria-label="Open a bucket">
      <div className="swap-box">
        <div className="swap-top">
          <label htmlFor="f-amount">WETH to supply</label>
          <span className="pill"><span className="pill-dot" aria-hidden="true" />{cSym} on {LENDER_REF}</span>
        </div>
        <input id="f-amount" className="huge" inputMode="decimal" placeholder="0" value={p.amount} onChange={(e) => p.setAmount(e.target.value)} aria-invalid={p.amount !== '' && collateral === undefined} />
        <div className="swap-sub">
          <span className="num">{collateral !== undefined && mk ? fmtUsd8((collateral * mk.collateralPrice) / 10n ** BigInt(c)) : mk ? `1 ${cSym} = ${fmtPrice8(mk.collateralPrice)}` : ''}</span>
          <span>
            {balance !== undefined && <>Wallet: <span className="num">{fmtToken(balance, c)}</span> {cSym}</>}
            {IS_TESTNET && !viewAs && (
              <> <button type="button" className="linkbtn" disabled={!isConnected || faucetTx.isPending || faucetTx.waiting}
                onClick={() => faucetTx.writeContract({ address: token!, abi: testWethAbi, functionName: 'faucet' })}>{txLabel(faucetTx, 'Get 1 test WETH')}</button></>
            )}
          </span>
        </div>
        {IS_TESTNET && <TxStatus tx={faucetTx} />}
      </div>

      <div className="swap-box">
        <div className="swap-top">
          <label htmlFor="f-borrow">USDC to borrow</label>
          <span className="pill"><span className="pill-dot usdc" aria-hidden="true" />USDC from {LENDER_REF}</span>
        </div>
        <input id="f-borrow" className="huge" inputMode="decimal" placeholder="0" value={p.borrow} onChange={(e) => p.setBorrow(e.target.value)} aria-invalid={p.borrow !== '' && borrowAmt === undefined} aria-describedby="f-borrow-h" />
        <div className="swap-sub" id="f-borrow-h">
          <span className={`health-words tone-${words.tone}`}>{words.text}</span>
          <span>{p.isAuto && collateral ? 'Set for health 1.50, you can change it' : safe !== undefined ? <>Safe limit <span className="num">{fmtToken(safe, d)}</span> USDC</> : ''}</span>
        </div>
        {liq !== undefined && dropPct !== undefined && mk && (
          <p className="hint">Liquidation if {cSym} falls to {fmtPrice8(liq)}, {fmtPct(dropPct, 1)} below {fmtPrice8(mk.collateralPrice)} now ({ORACLE_NAME}).</p>
        )}
      </div>

      <RulesFields value={rulesIn} onChange={setRulesIn} maxTipBps={SPEC_MAX_TIP_BPS} idPrefix="f" compact />

      <div className="into">
        <div className="field small-field">
          <label htmlFor="f-buffer">Exit buffer, USDC</label>
          <input id="f-buffer" inputMode="decimal" value={p.buffer} placeholder="1% of the borrow" onChange={(e) => p.setBuffer(e.target.value)} />
        </div>
        <div className="into-route">
          <span className="muted small">Your USDC goes into</span>
          <b>{route ? route.name : 'no route yet'}</b>
          {route && <span className="chips"><ExitChip row={route} />{route.net !== undefined && <Chip tone={route.net >= 0 ? 'ok' : 'bad'}>{earnsLabel(route.net)}</Chip>}</span>}
        </div>
      </div>

      {viewAs ? <Notice>Read only: you are viewing {short(viewAs)}. <a href="#home">Stop viewing</a> to open a bucket.</Notice> : <>
      <ol className="stepper" aria-label="Steps">
        <li className={isConnected ? 'done' : 'now'}>Connect</li>
        <li className={approved ? 'done' : step === 'approve' ? 'now' : ''}>Allow {cSym}</li>
        <li className={created ? 'done' : step === 'open' ? 'now' : ''}>Open</li>
      </ol>
      <button className="btn primary cta" type="submit" disabled={busy || !!stepReason}>{label}</button>
      {stepReason && <p className="reason">{stepReason}</p>}
      <TxStatus tx={approveTx} />
      <TxStatus tx={openTx} done={created && <a href={`#bucket-${created}`}>Go to your bucket</a>} />
      </>}
      {route && <RouteSteps route={route} cSym={cSym} />}
      <p className="hint">Preview from the liquidation threshold and {ORACLE_NAME} prices right now. {LENDER} checks again when the transaction runs.</p>
    </form>
  )
}

/** Every step and contract before you sign, plus how the exit works and the risks. */
function RouteSteps({ route, cSym }: { route: VaultRow; cSym: string }) {
  const pool = IS_TESTNET ? 'Open Bucket test pool' : 'Aave V3 Pool'
  return (
    <details className="steps-detail">
      <summary>What happens, step by step</summary>
      <div className="detail">
        <div>
          <h4>When you open</h4>
          <ol>
            <li>You let the Open Bucket factory (<Addr a={FACTORY} />) take the {cSym} (<Addr a={COLLATERAL} />) you entered.</li>
            <li>In one transaction it creates a bucket only you own and moves the {cSym} into it.</li>
            <li>The bucket supplies the {cSym} to the {pool} (<Addr a={AAVE_POOL} />) and borrows USDC (<Addr a={USDC} />), priced by {ORACLE_NAME} (<Addr a={AAVE_ORACLE} />).</li>
            <li>It keeps the exit buffer and puts the rest in {route.name} (<Addr a={route.address} />), then stores your exit rules.</li>
          </ol>
        </div>
        <div>
          <h4>When it exits</h4>
          <ol>
            <li>Take all the USDC out of the vault and repay the whole loan.</li>
            <li>Take all the {cSym} back from {LENDER_REF}.</li>
            <li>Pay the tip in {cSym} if someone else triggered it, at most 0.5%. Everything else goes to you.</li>
          </ol>
          <p className="hint">You can exit any time. Anyone else can only while one of your rules is true, and the money still only goes to you.</p>
        </div>
        <div>
          <h4>Risks</h4>
          <ul>
            <li>{route.exitNote}. If the vault has too little cash, exit waits until it has enough.</li>
            <li>No swaps: if interest outgrows the vault yield plus the buffer, exit stops and says how much USDC is missing.</li>
            <li>A very fast price drop can reach liquidation before an exit lands.</li>
            <li>Smart contract risk in {LENDER_REF}, the vault and Open Bucket, a hackathon build that is not audited.</li>
          </ul>
        </div>
      </div>
    </details>
  )
}

function RoutesPanel(p: {
  rows: VaultRow[]; route?: VaultRow; onPick: (a: Address) => void; tab: 'yield' | 'exit'; setTab: (t: 'yield' | 'exit') => void
  mk?: MarketInfo; borrowAmt?: bigint; bufferAmt?: bigint; loading: boolean; yieldsError: unknown
}) {
  const [hero, ...rest] = p.rows
  const basis = p.borrowAmt ? `${fmtToken(p.borrowAmt, p.mk?.debtDecimals ?? 6)} USDC` : '1,000 USDC'
  return (
    <section className="card routes-panel" aria-labelledby="routes-h">
      <div className="routes-head">
        <div>
          <h2 id="routes-h">Routes</h2>
          <p className="muted small">{p.rows.length} {p.rows.length === 1 ? 'vault' : 'vaults'} on {IS_TESTNET ? 'Monad testnet' : 'Monad'} · net of the borrow cost · refreshed every block</p>
        </div>
        <div className="tabs" role="group" aria-label="Sort routes">
          <button type="button" aria-pressed={p.tab === 'yield'} onClick={() => p.setTab('yield')}>Best yield</button>
          <button type="button" aria-pressed={p.tab === 'exit'} onClick={() => p.setTab('exit')}>Fastest exit</button>
        </div>
      </div>
      {p.loading && p.rows.length === 0 ? <p className="muted" role="status">Loading vaults.</p>
        : !hero ? <p className="muted">{IS_TESTNET ? 'The factory has no test vault on its allowlist yet.' : 'No vaults to show.'}</p>
        : (
          <>
            <RouteItem row={hero} best={hero} hero badge={p.tab === 'yield' ? 'Best yield' : 'Fastest exit'} selected={p.route?.address === hero.address} onPick={p.onPick} mk={p.mk} borrowAmt={p.borrowAmt} bufferAmt={p.bufferAmt} basis={basis} />
            {rest.length > 0 && (
              <>
                <div className="other-head"><span>Other vaults</span><span>A year, on {basis} · vs best</span></div>
                <div className="other-list">
                  {rest.map((r) => <RouteItem key={r.address} row={r} best={hero} selected={p.route?.address === r.address} onPick={p.onPick} mk={p.mk} borrowAmt={p.borrowAmt} bufferAmt={p.bufferAmt} basis={basis} />)}
                </div>
              </>
            )}
          </>
        )}
      <p className="hint">{EXIT_CHECKED} (how much each vault could pay out at once). {IS_TESTNET ? 'Testnet: the test pool charges no interest and the test vault has no strategy. Mainnet vault yields come from DefiLlama' : 'Vault yields from DefiLlama through our agent'}{p.yieldsError && !IS_TESTNET ? ', not reachable right now' : ''}; borrow cost read from {LENDER} every block. Figures a year are estimates at today's rates.</p>
    </section>
  )
}

function RouteItem({ row, best, hero, badge, selected, onPick, mk, borrowAmt, bufferAmt, basis }: {
  row: VaultRow; best: VaultRow; hero?: boolean; badge?: string; selected: boolean; onPick: (a: Address) => void
  mk?: MarketInfo; borrowAmt?: bigint; bufferAmt?: bigint; basis: string
}) {
  const y = yearlyUsd(row, mk, borrowAmt, bufferAmt)
  const vs = row.net !== undefined && best.net !== undefined ? row.net - best.net : undefined
  const pick = () => { if (!row.viewOnly) onPick(row.address) }
  return (
    <div className={`route-item${hero ? ' hero' : ''}${selected ? ' on' : ''}${row.viewOnly ? ' view-only' : ''}`} data-testid="route-row" onClick={pick}>
      <button type="button" className="pick" aria-label="Choose route" aria-pressed={selected} disabled={!!row.viewOnly} onClick={(e) => { e.stopPropagation(); pick() }}>
        <span className="pick-dot" aria-hidden="true" />
      </button>
      <div className="route-main">
        <div className="route-title"><b>{row.name}</b>{badge && <Chip tone="acc">{badge}</Chip>}{row.viewOnly && <Chip tone="plain">View only</Chip>}</div>
        {hero && (
          <>
            <div className="hero-num">{y !== undefined ? <><Money usd={y} /><span className="unit">a year</span></> : <span className="muted">{IS_TESTNET ? 'Test vault, no yield' : 'Yield not available'}</span>}</div>
            <p className="muted">{row.apy !== undefined && mk ? `${fmtPct(row.apy)} vault yield − ${fmtPct(mk.borrowApr)} borrow cost, on ${basis} borrowed` : IS_TESTNET ? 'On testnet the vault holds test USDC with no strategy, so it earns nothing. On mainnet this card shows the live vault yield minus the Aave borrow cost (SharpByte: about +3.7% a year).' : 'No yield figure for this vault yet.'}</p>
          </>
        )}
        <div className="chips">
          <ExitChip row={row} />
          {row.net !== undefined && <Chip tone={row.net >= 0 ? 'ok' : 'bad'}>{earnsLabel(row.net)}</Chip>}
          <Chip tone="plain">{row.who}</Chip>
          {row.tvl !== undefined && <Chip tone="plain">{fmtToken(row.tvl, mk?.debtDecimals ?? 6, 0)} USDC inside</Chip>}
        </div>
        {hero && (
          <div className="path" aria-label="Path">
            {[mk?.cSym ?? 'WETH', LENDER, 'USDC', row.name].map((s, i) => <Fragment key={s}>{i > 0 && <span className="arrow" aria-hidden="true">→</span>}<span className="path-chip">{s}</span></Fragment>)}
          </div>
        )}
        {row.viewOnly && <p className="view-note">{row.viewOnly}</p>}
      </div>
      {!hero && (
        <div className="route-nums">
          <span className="v">{y !== undefined ? <Money usd={y} /> : <span className="muted">n/a</span>}</span>
          <span className={`vs ${vs === undefined ? 'muted' : vs < 0 ? 'tone-bad' : 'tone-ok'}`}>{vs === undefined ? 'n/a' : `${vs > 0 ? '+' : ''}${fmtPct(vs)}`}</span>
        </div>
      )}
    </div>
  )
}
