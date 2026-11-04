// Live market data shared by Discover, My money and the bucket screen: lending market, vault board, rules inputs.
import { useQuery } from '@tanstack/react-query'
import { parseUnits, type Address } from 'viem'
import { useReadContract, useReadContracts } from 'wagmi'
import { erc20Abi, factoryAbi, oracleAbi, poolAbi, vaultAbi } from './abi'
import { AAVE_ORACLE, AAVE_POOL, AGENT_URL, COLLATERAL, FACTORY, IS_TESTNET, POLL_MS, USDC } from './config'
import { fmtPct, rayToPct } from './format'
import { decodeReserveConfig, type Market } from './math'
import { MAINNET_VAULTS, testVault, viewOnlyReason, type VaultInfo } from './vaults'

type Yield = { pool: string; project: string; symbol: string; apy: number | null; apyBase: number | null; tvlUsd: number; underlyingTokens: string[] | null; poolMeta: string | null }

/** Vault APYs: the agent proxies DefiLlama yields, filtered to Monad. */
export function useYields() {
  return useQuery({
    queryKey: ['yields', AGENT_URL],
    queryFn: async () => {
      const r = await fetch(`${AGENT_URL}/yields`).catch(() => { throw new Error('the agent is not reachable') })
      if (!r.ok) throw new Error(`agent /yields answered ${r.status}`)
      const j = await r.json()
      const list = Array.isArray(j) ? j : Array.isArray(j?.data) ? j.data : undefined
      if (!list) throw new Error('agent /yields did not return a list')
      return list as Yield[]
    },
    refetchInterval: 60_000,
    retry: 0,
  })
}

/** DefiLlama pool ids are UUIDs: match the registry's pool id, then the address, then a unique symbol. */
function yieldFor(list: Yield[] | undefined, v: VaultInfo, symbol: string | undefined) {
  if (!list) return undefined
  if (v.llamaPool) {
    const byId = list.find((p) => p.pool === v.llamaPool)
    if (byId) return byId
  }
  const byAddr = list.find((p) => [p.pool, p.poolMeta].some((s) => typeof s === 'string' && s.toLowerCase().includes(v.address.toLowerCase())))
  if (byAddr || !symbol) return byAddr
  const bySym = list.filter((p) => p.symbol?.toLowerCase() === symbol.toLowerCase())
  return bySym.length === 1 ? bySym[0] : undefined
}

export type MarketInfo = Market & {
  collateralToken: Address; cSym: string; frozen: boolean
  /** Lender rates as APR %, from Pool.getReserveData (ray). */
  borrowApr: number; usdcSupplyApr: number; collSupplyApr: number
}

export function useMarket() {
  const ready = !!(AAVE_POOL && AAVE_ORACLE && USDC && COLLATERAL)
  const q = useReadContracts({
    contracts: [
      { address: AAVE_POOL!, abi: poolAbi, functionName: 'getReserveData', args: [USDC!] },
      { address: AAVE_POOL!, abi: poolAbi, functionName: 'getReserveData', args: [COLLATERAL!] },
      { address: AAVE_ORACLE!, abi: oracleAbi, functionName: 'getAssetPrice', args: [COLLATERAL!] },
      { address: AAVE_ORACLE!, abi: oracleAbi, functionName: 'getAssetPrice', args: [USDC!] },
      { address: COLLATERAL!, abi: erc20Abi, functionName: 'decimals' },
      { address: USDC!, abi: erc20Abi, functionName: 'decimals' },
      { address: COLLATERAL!, abi: erc20Abi, functionName: 'symbol' },
    ],
    query: { enabled: ready, refetchInterval: POLL_MS },
  })
  const [usdcR, collR, pC, pD, cDec, dDec, cSym] = q.data ?? []
  let market: MarketInfo | undefined
  if (COLLATERAL && usdcR?.result && collR?.result && pC?.result !== undefined && pD?.result !== undefined && cDec?.result !== undefined && dDec?.result !== undefined) {
    const data = collR.result.configuration.data
    market = {
      ...decodeReserveConfig(data),
      collateralPrice: pC.result, debtPrice: pD.result, collateralDecimals: cDec.result, debtDecimals: dDec.result,
      collateralToken: COLLATERAL, cSym: cSym?.result ?? 'WETH',
      borrowApr: rayToPct(usdcR.result.currentVariableBorrowRate),
      usdcSupplyApr: rayToPct(usdcR.result.currentLiquidityRate),
      collSupplyApr: rayToPct(collR.result.currentLiquidityRate),
      frozen: ((data >> 57n) & 1n) === 1n || ((data >> 56n) & 1n) === 0n, // bit 56 active, bit 57 frozen
    }
  }
  const firstError = q.error ?? q.data?.find((r) => r.status === 'failure')?.error
  return { market, isLoading: q.isLoading, error: firstError, ready }
}

export type VaultRow = VaultInfo & {
  tvl?: bigint
  /** Vault yield, % a year, and where it came from. */
  apy?: number; apySource?: string
  /** Vault yield minus the borrow cost, in points. */
  net?: number
  allowed?: boolean
  viewOnly?: string
}

/** Every known vault with live size, yield, net carry and whether the factory lets you use it. */
export function useVaultBoard(market: MarketInfo | undefined) {
  const testList = useReadContract({ address: FACTORY!, abi: factoryAbi, functionName: 'allowedVaults', query: { enabled: IS_TESTNET && !!FACTORY, refetchInterval: 10_000 } })
  const registry: VaultInfo[] = IS_TESTNET ? (testList.data ?? []).map(testVault) : MAINNET_VAULTS
  const allowed = useReadContracts({
    contracts: registry.map((v) => ({ address: FACTORY!, abi: factoryAbi, functionName: 'isVaultAllowed', args: [v.address] }) as const),
    query: { enabled: !!FACTORY && registry.length > 0, refetchInterval: 10_000 },
  })
  const live = useReadContracts({
    contracts: registry.flatMap((v) => [
      { address: v.address, abi: vaultAbi, functionName: 'totalAssets' } as const,
      { address: v.address, abi: vaultAbi, functionName: 'symbol' } as const,
    ]),
    query: { enabled: registry.length > 0, refetchInterval: POLL_MS },
  })
  const yields = useYields()
  const rows: VaultRow[] = registry.map((v, i) => {
    const ok = allowed.data?.[i]?.result as boolean | undefined
    const symbol = live.data?.[i * 2 + 1]?.result as string | undefined
    const y = v.yieldFrom === 'aave-supply' ? undefined : yieldFor(yields.data, v, symbol)
    const apy = v.yieldFrom === 'aave-supply' ? market?.usdcSupplyApr : y?.apy ?? undefined
    const apySource = v.yieldFrom === 'aave-supply' ? 'Aave USDC supply rate, onchain' : y ? `DefiLlama ${y.project} ${y.symbol}` : undefined
    return {
      ...v, tvl: live.data?.[i * 2]?.result as bigint | undefined, apy, apySource,
      net: apy !== undefined && market ? apy - market.borrowApr : undefined,
      allowed: ok, viewOnly: viewOnlyReason(v, ok, !!FACTORY),
    }
  })
  return { rows, yields, loading: live.isLoading || (IS_TESTNET && testList.isLoading) }
}

/** "Earns 3.7%" or "Loses 0.8%": the net carry in plain words. */
export const earnsLabel = (net: number) => (net >= 0 ? `Earns ${fmtPct(net, 1)}` : `Loses ${fmtPct(-net, 1)}`)

export const parse = (s: string, d: number): bigint | undefined => {
  try {
    const t = s.trim()
    return t ? parseUnits(t.replace(/,/g, ''), d) : undefined
  } catch {
    return undefined
  }
}

/** Shared by the open form and the bucket's "Edit rules". Values are plain strings from the inputs. */
export type RulesInput = { floor: string; deadline: string; tip: string }
export function parseRules(r: RulesInput, maxTipBps: number) {
  const minHealth = r.floor.trim() === '' ? 0n : parse(r.floor, 18)
  const deadlineMs = r.deadline ? new Date(r.deadline).getTime() : 0
  const tipBps = r.tip.trim() === '' ? 0 : Math.round(Number(r.tip) * 100)
  let reason: string | undefined
  if (minHealth === undefined) reason = 'The exit line must be a number, like 1.15.'
  else if (minHealth !== 0n && minHealth <= 10n ** 18n) reason = 'Set the exit line above 1.00, where liquidation starts. Leave it empty for no health rule.'
  else if (Number.isNaN(deadlineMs)) reason = 'The deadline is not a valid date.'
  else if (deadlineMs !== 0 && deadlineMs <= Date.now()) reason = 'The deadline must be in the future.'
  else if (!Number.isFinite(tipBps) || tipBps < 0) reason = 'The tip must be a percentage, like 0.1.'
  else if (tipBps > maxTipBps) reason = `The tip can be at most ${fmtPct(maxTipBps / 100)}.`
  return { rules: { deadline: BigInt(Math.floor(deadlineMs / 1000)), minHealth: minHealth ?? 0n, tipBps }, reason }
}

export function RulesFields({ value, onChange, maxTipBps, idPrefix, compact }: { value: RulesInput; onChange: (v: RulesInput) => void; maxTipBps: number; idPrefix: string; compact?: boolean }) {
  const id = (s: string) => `${idPrefix}-${s}`
  return (
    <fieldset className={compact ? 'rule-chips' : undefined}>
      <legend>Exit rules</legend>
      <div className="fields">
        <div className="field">
          <label htmlFor={id('floor')}>Exit if health falls below</label>
          <input id={id('floor')} inputMode="decimal" value={value.floor} onChange={(e) => onChange({ ...value, floor: e.target.value })} aria-describedby={id('floor-h')} />
          <span className="hint" id={id('floor-h')}>Liquidation starts at 1.00. Empty means no health rule.</span>
        </div>
        <div className="field">
          <label htmlFor={id('deadline')}>Exit by (optional)</label>
          <input id={id('deadline')} type="datetime-local" value={value.deadline} onChange={(e) => onChange({ ...value, deadline: e.target.value })} aria-describedby={id('deadline-h')} />
          <span className="hint" id={id('deadline-h')}>Your local time. After it, anyone can trigger the exit.</span>
        </div>
        <div className="field">
          <label htmlFor={id('tip')}>Tip for the agent (%)</label>
          <input id={id('tip')} inputMode="decimal" value={value.tip} onChange={(e) => onChange({ ...value, tip: e.target.value })} aria-describedby={id('tip-h')} />
          <span className="hint" id={id('tip-h')}>Paid in collateral, only to a caller who is not you. At most {fmtPct(maxTipBps / 100)}.</span>
        </div>
      </div>
    </fieldset>
  )
}
