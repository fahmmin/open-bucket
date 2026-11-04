import { useQueries } from '@tanstack/react-query'
import type { Address } from 'viem'
import { useAccount, useConnect, usePublicClient, useReadContract, useReadContracts } from 'wagmi'
import { bucketAbi, erc20Abi, factoryAbi, oracleAbi } from '../abi'
import { AAVE_ORACLE, FACTORY, LENDER, ORACLE_NAME, POLL_MS } from '../config'
import { loadHistory, useAgentPulse } from '../chain'
import { explain, fmtHf, fmtPct, fmtTime, fmtToken, fmtUsd8, short } from '../format'
import { equityUsd } from '../math'
import { earnsLabel, useMarket, useVaultBoard, type MarketInfo, type VaultRow } from '../market'
import { Chip, HealthRuler, Notice, Stat, healthTone, useViewAs } from '../ui'
import { ExitChip, Money, sortRoutes, yearlyUsd } from './Discover'

const NO_DEBT = 10n ** 30n
const usd8 = (v: bigint) => Number(v) / 1e8

export function Home() {
  const { address: connected } = useAccount()
  const viewAs = useViewAs()
  const address = viewAs ?? connected
  const { market: mk } = useMarket()
  const board = useVaultBoard(mk)
  const best = sortRoutes(board.rows, 'yield')[0]
  return (
    <>
      <div className="page-head">
        <h1>What is my money doing?</h1>
        <p>Everything in your buckets, read live from the chain.</p>
      </div>
      {address ? <MyMoney account={address} mk={mk} rows={board.rows} best={best} /> : <Empty best={best} mk={mk} />}
    </>
  )
}

function BestRouteCard({ best, mk, title }: { best?: VaultRow; mk?: MarketInfo; title: string }) {
  if (!best) return null
  const y = yearlyUsd(best, mk, undefined)
  return (
    <section className="acard" aria-labelledby="t-best">
      <div className="acard-head"><h2 id="t-best">{title}</h2><a className="link" href="#discover">See every route →</a></div>
      <div className="stack" style={{ gap: 10 }}>
        <strong className="stat-value">{y !== undefined ? <Money usd={y} /> : <span className="muted">Yield not available</span>}<small>a year on 1,000 USDC borrowed</small></strong>
        <p><b>{best.name}</b>{best.viewOnly ? ' (view only)' : ''}</p>
        <div className="chips"><ExitChip row={best} />{best.net !== undefined && <Chip tone={best.net >= 0 ? 'ok' : 'bad'}>{earnsLabel(best.net)}</Chip>}<Chip tone="plain">{best.who}</Chip></div>
      </div>
    </section>
  )
}

function Empty({ best, mk }: { best?: VaultRow; mk?: MarketInfo }) {
  const { connect, connectors, isPending } = useConnect()
  return (
    <div className="grid-2">
      <section className="acard" aria-labelledby="t-empty">
        <div className="acard-head"><h2 id="t-empty">Your buckets show up here</h2></div>
        <div className="empty-state">
          <p>Connect the wallet you opened them with. Nothing is sent until you approve it in your wallet.</p>
          <button className="abtn" type="button" disabled={isPending} onClick={() => connect({ connector: connectors[0] })}>{isPending ? 'Check your wallet' : 'Connect a wallet'}</button>
        </div>
      </section>
      <BestRouteCard best={best} mk={mk} title="Best route right now" />
    </div>
  )
}

type Pos = readonly [bigint, bigint, bigint, bigint, bigint, bigint]

function MyMoney({ account, mk, rows, best }: { account: Address; mk?: MarketInfo; rows: VaultRow[]; best?: VaultRow }) {
  const client = usePublicClient()
  const pulse = useAgentPulse()
  const list = useReadContract({ address: FACTORY!, abi: factoryAbi, functionName: 'bucketsOf', args: [account], query: { enabled: !!FACTORY, refetchInterval: 5000 } })
  const buckets = [...(list.data ?? [])].reverse()
  const reads = useReadContracts({
    contracts: buckets.flatMap((b) => [
      { address: b, abi: bucketAbi, functionName: 'position' } as const,
      { address: b, abi: bucketAbi, functionName: 'rules' } as const,
      { address: b, abi: bucketAbi, functionName: 'closed' } as const,
      { address: b, abi: bucketAbi, functionName: 'vault' } as const,
      { address: b, abi: bucketAbi, functionName: 'collateral' } as const,
      { address: b, abi: bucketAbi, functionName: 'debtAsset' } as const,
    ]),
    query: { enabled: buckets.length > 0, refetchInterval: POLL_MS },
  })
  const raw = buckets.map((address, i) => {
    const r = (k: number) => reads.data?.[i * 6 + k]?.result
    return { address, pos: r(0) as Pos | undefined, rules: r(1) as readonly [bigint, bigint, number] | undefined, closed: r(2) as boolean | undefined, vault: r(3) as Address | undefined, coll: r(4) as Address | undefined, debt: r(5) as Address | undefined }
  })
  const metaReady = raw.length > 0 && raw.every((b) => b.coll && b.debt) && !!AAVE_ORACLE
  const meta = useReadContracts({
    contracts: raw.flatMap((b) => [
      { address: AAVE_ORACLE!, abi: oracleAbi, functionName: 'getAssetPrice', args: [b.coll!] } as const,
      { address: AAVE_ORACLE!, abi: oracleAbi, functionName: 'getAssetPrice', args: [b.debt!] } as const,
      { address: b.coll!, abi: erc20Abi, functionName: 'decimals' } as const,
      { address: b.debt!, abi: erc20Abi, functionName: 'decimals' } as const,
      { address: b.coll!, abi: erc20Abi, functionName: 'symbol' } as const,
    ]),
    query: { enabled: metaReady, refetchInterval: POLL_MS },
  })
  const histories = useQueries({
    queries: raw.map((b) => ({
      queryKey: ['history', b.address, !!b.closed],
      queryFn: () => loadHistory(client!, b.address, !!b.closed),
      enabled: !!client && b.closed !== undefined,
      staleTime: Infinity,
    })),
  })

  const items = raw.map((b, i) => {
    const m = (k: number) => meta.data?.[i * 5 + k]?.result
    const cPrice = m(0) as bigint | undefined, dPrice = m(1) as bigint | undefined, cDec = m(2) as number | undefined, dDec = m(3) as number | undefined
    const cSym = (m(4) as string | undefined) ?? 'collateral'
    const p = b.pos && { collateralAmount: b.pos[0], vaultAssets: b.pos[2], idleDebtAsset: b.pos[3], debt: b.pos[4] }
    const priced = p && cPrice !== undefined && dPrice !== undefined && cDec !== undefined && dDec !== undefined
    const equity = priced ? equityUsd(p, cPrice, dPrice, cDec, dDec) : undefined
    const row = rows.find((r) => b.vault && r.address.toLowerCase() === b.vault.toLowerCase())
    // Estimate a year in USD: vault yield on what is in the vault, minus the borrow cost, plus the collateral's supply rate.
    let yearly: number | undefined
    if (priced && mk && row?.apy !== undefined && !b.closed) {
      const vaultUsd = usd8((p.vaultAssets * dPrice) / 10n ** BigInt(dDec))
      const debtUsd = usd8((p.debt * dPrice) / 10n ** BigInt(dDec))
      const collUsd = usd8((p.collateralAmount * cPrice) / 10n ** BigInt(cDec))
      const collApr = b.coll?.toLowerCase() === mk.collateralToken.toLowerCase() ? mk.collSupplyApr : 0
      yearly = (vaultUsd * row.apy - debtUsd * mk.borrowApr + collUsd * collApr) / 100
    }
    return { ...b, equity, yearly, row, cSym, cDec, dDec }
  })
  const open = items.filter((b) => b.closed === false)
  const totalEquity = open.reduce((s, b) => s + (b.equity ?? 0n), 0n)
  const known = open.filter((b) => b.yearly !== undefined)
  const yearly = known.reduce((s, b) => s + b.yearly!, 0)
  const equityUsdNum = usd8(totalEquity)
  const lowest = open.filter((b) => b.pos && b.pos[5] < NO_DEBT).sort((a, b) => (a.pos![5] < b.pos![5] ? -1 : 1))[0]
  const bestAllowed = rows.filter((r) => r.allowed && r.net !== undefined).sort((a, b) => b.net! - a.net!)[0]
  const better = bestAllowed && open.find((b) => b.row?.net !== undefined && b.row.address !== bestAllowed.address && bestAllowed.net! - b.row.net > 0.5)
  const activity = histories.flatMap((h, i) => (h.data?.logs ?? []).map((l) => ({ ...l, bucket: items[i].address, it: items[i] })))
    .sort((a, b) => Number((b.blockNumber ?? 0n) - (a.blockNumber ?? 0n))).slice(0, 8)

  if (!FACTORY) return <Notice tone="warn">No Open Bucket factory is configured (VITE_FACTORY), so there are no buckets to show.</Notice>
  if (list.isLoading) return <p className="muted" role="status">Loading your buckets.</p>
  if (list.error) return <Notice tone="bad">Could not load your buckets: {explain(list.error)}</Notice>
  if (buckets.length === 0)
    return (
      <div className="grid-2">
        <section className="acard" aria-labelledby="t-none">
          <div className="acard-head"><h2 id="t-none">You have no buckets yet</h2></div>
          <div className="empty-state">
            <p>A bucket holds your loan and your vault deposit together, with exit rules an agent watches every block.</p>
            <a className="abtn" href="#discover">Find a route</a>
          </div>
        </section>
        <BestRouteCard best={best} mk={mk} title="Best route right now" />
      </div>
    )

  const lowHf = lowest?.pos?.[5]
  const missingYield = open.length - known.length
  return (
    <>
      <div className="stats-row">
        <Stat label="In your buckets" value={metaReady && meta.data ? <Money usd={equityUsdNum} sign={false} /> : undefined}
          sub={`${open.length} open of ${buckets.length}, priced by ${ORACLE_NAME}`} />
        <Stat label="Earning, estimate" value={known.length > 0 ? <Money usd={yearly / 365} /> : open.length === 0 ? 'Nothing' : 'n/a'} unit={known.length > 0 ? 'a day' : undefined}
          sub={known.length > 0
            ? `${equityUsdNum > 0 ? `${fmtPct((yearly / equityUsdNum) * 100)} a year on your money. ` : ''}Vault yield minus the ${LENDER} borrow cost plus the collateral supply rate, at today's rates.${missingYield > 0 ? ` ${missingYield} without a yield figure not counted.` : ''}`
            : open.length === 0 ? 'No open buckets.' : 'No yield figure for your vaults yet.'} />
        <Stat label="Lowest health" value={lowHf !== undefined ? <span className={`tone-${healthTone(Number(lowHf) / 1e18)}`}>{fmtHf(lowHf)}</span> : open.length ? 'no debt' : 'n/a'}
          sub={lowest ? <>{lowest.row?.name ?? short(lowest.address)}, exit line {lowest.rules?.[1] ? fmtHf(lowest.rules[1]) : 'none'}</> : 'No open bucket has a loan.'} />
        <div className="stat">
          <span className="stat-label"><span key={pulse.lastBlock} className={`beat ${pulse.status === 'live' ? 'on' : ''}`} aria-hidden="true" /> Agent</span>
          {pulse.status === 'offline' ? <strong className="stat-value">Offline</strong>
            : pulse.lastBlock === undefined ? <span className="skel" style={{ width: '60%', height: 30 }} />
            : <strong className="stat-value">{pulse.watching}<small>bucket{pulse.watching === 1 ? '' : 's'} watched</small></strong>}
          <span className="stat-sub">{pulse.status === 'offline' ? 'Agent offline: exits still work, anyone can trigger them.'
            : pulse.lastBlock !== undefined ? <>Last block <span className="mono">#{pulse.lastBlock.toLocaleString('en-US')}</span>, {pulse.blocksSinceOpen.toLocaleString('en-US')} checked since you opened this page</> : 'Connecting to the agent.'}</span>
        </div>
      </div>

      <div className="grid-2">
        <section className="acard" aria-labelledby="t-yours">
          <div className="acard-head"><h2 id="t-yours">Your buckets</h2><a className="link" href="#discover">Open another →</a></div>
          <div className="yours">
            {items.map((b) => (
              <a className="item" key={b.address} href={`#bucket-${b.address}`}>
                <span className="stack" style={{ gap: 0 }}>
                  <b>{b.row?.name ?? (b.vault ? short(b.vault) : 'Bucket')}</b>
                  <span className="mono small muted">{short(b.address)}</span>
                </span>
                <span className="yours-nums">
                  {b.equity !== undefined && <span className="num">{fmtUsd8(b.equity)}</span>}
                  {b.closed ? <Chip tone="plain">Closed</Chip> : b.pos && b.pos[5] < NO_DEBT ? <Chip tone={healthTone(Number(b.pos[5]) / 1e18)}>Health {fmtHf(b.pos[5])}</Chip> : <Chip tone="ok">Open</Chip>}
                </span>
              </a>
            ))}
          </div>
        </section>

        <section className="acard" aria-labelledby="t-low">
          <div className="acard-head"><h2 id="t-low">Lowest health</h2>{lowest && <a className="link" href={`#bucket-${lowest.address}`}>Open its page →</a>}</div>
          {lowest ? (
            <>
              <div className="health-head">
                <span>{lowest.row?.name ?? short(lowest.address)}</span>
                <span className={`value tone-${healthTone(Number(lowest.pos![5]) / 1e18)}`}>{fmtHf(lowest.pos![5])}</span>
              </div>
              <HealthRuler hf={lowest.pos![5]} floor={lowest.rules?.[1]} />
            </>
          ) : <p className="muted">No open bucket has a loan right now.</p>}
        </section>
      </div>

      {better && bestAllowed && (
        <section className="acard better" aria-labelledby="t-better">
          <div className="acard-head"><h2 id="t-better">Better route found</h2><a className="link" href="#discover">Compare routes →</a></div>
          <p><b>{bestAllowed.name}</b> earns {fmtPct(bestAllowed.net!)} after the borrow cost. Your {better.row!.name} earns {fmtPct(better.row!.net!)}.</p>
          <div className="chips" style={{ marginTop: 10 }}><ExitChip row={bestAllowed} /><Chip tone="plain">{bestAllowed.who}</Chip></div>
        </section>
      )}

      <section className="acard" aria-labelledby="t-act">
        <div className="acard-head"><h2 id="t-act">Activity</h2></div>
        {histories.some((h) => h.isLoading) && activity.length === 0
          ? <div className="stack" style={{ gap: 12 }} role="status" aria-label="Finding your transactions"><span className="skel" /><span className="skel" /></div>
          : activity.length === 0 ? <p className="muted">No activity found yet.</p> : (
            <ul className="mini-feed">
              {activity.map((l) => (
                <li key={`${l.transactionHash}-${l.logIndex}`}>
                  <span className={`dot-badge ${l.eventName}`} aria-hidden="true" />
                  <div>
                    <strong>{l.eventName === 'RulesSet' ? 'Rules set' : l.eventName}</strong>{' '}
                    <a href={`#bucket-${l.bucket}`}>{l.it.row?.name ?? short(l.bucket)}</a>
                    <p>
                      {l.eventName === 'Opened' && l.it.cDec !== undefined && l.it.dDec !== undefined && <>{fmtToken(l.args.collateralAmount!, l.it.cDec)} {l.it.cSym} in, {fmtToken(l.args.borrowed!, l.it.dDec)} USDC borrowed</>}
                      {l.eventName === 'Exited' && l.it.cDec !== undefined && <>{fmtToken(l.args.collateralToOwner!, l.it.cDec)} {l.it.cSym} back to you</>}
                      {l.eventName === 'RulesSet' && <>Exit line {l.args.minHealth ? fmtHf(l.args.minHealth) : 'none'}</>}
                    </p>
                  </div>
                  <span className="when">{l.timestamp ? fmtTime(l.timestamp) : ''}</span>
                </li>
              ))}
            </ul>
          )}
      </section>
    </>
  )
}

