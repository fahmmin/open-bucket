import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError, formatUnits } from 'viem'
import { truncHf } from './math'

const nf = (frac: number) => new Intl.NumberFormat('en-US', { minimumFractionDigits: frac, maximumFractionDigits: frac })

/** Token amount from raw units. 18-decimal tokens get 4 decimals, others 2. Never shows raw wei. */
export function fmtToken(v: bigint, decimals: number, frac = decimals >= 18 ? 4 : 2): string {
  return nf(frac).format(Number(formatUnits(v, decimals)))
}

/** 8-decimal USD (AaveOracle base currency). */
export function fmtUsd8(v: bigint, frac = 2): string {
  const n = Number(formatUnits(v, 8))
  return (n < 0 ? '-$' : '$') + nf(frac).format(Math.abs(n))
}

/** Price with enough decimals to see a 4% move on a cheap token. */
export function fmtPrice8(v: bigint): string {
  const n = Number(formatUnits(v, 8))
  return fmtUsd8(v, n >= 100 ? 2 : n >= 1 ? 4 : 6)
}

/** Health factor from wad. Aave returns type(uint256).max when there is no debt. */
export function hfNumber(v: bigint | undefined): number | undefined {
  if (v === undefined || v > 10n ** 30n) return undefined
  return Number(formatUnits(v, 18))
}
/** The one health format: truncated to 2 decimals (agent rule), "no debt" for Aave's max value. */
export const fmtHf = (v: bigint | undefined) => (v === undefined ? 'n/a' : v > 10n ** 30n ? 'no debt' : truncHf(v))

/** Aave rates are APRs in ray (1e27 = 100%). */
export const rayToPct = (r: bigint) => Number(r) / 1e25
export const fmtPct = (n: number, frac = 2) => `${nf(frac).format(n)}%`

export const short = (s: string, head = 6, tail = 4) => (s.length > head + tail + 1 ? `${s.slice(0, head)}…${s.slice(-tail)}` : s)

export function fmtCountdown(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60
  const mmss = `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
  return h > 0 ? `${h}:${mmss}` : mmss
}

export const fmtTime = (unixSec: bigint | number) =>
  new Date(Number(unixSec) * 1000).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })

const bucketErrors: Record<string, (args: readonly unknown[]) => string> = {
  NotOwner: () => 'Only the owner of this bucket can do that.',
  NotFactory: () => 'Only the factory can open a bucket.',
  AlreadyOpen: () => 'This bucket is already open.',
  Closed: () => 'This bucket is already closed.',
  NoRuleTriggered: () => 'No exit rule is true yet, so only the owner can exit right now.',
  TipTooHigh: () => 'The tip is above the maximum of 0.5%.',
  BufferTooLarge: () => 'The buffer must be smaller than the borrow.',
  NotAdmin: () => 'Only the factory admin can do that.',
  VaultNotAllowed: () => 'This vault is not on the factory allowlist.',
  WrongVaultAsset: () => "The vault's asset is not the debt asset.",
  UnsupportedCollateral: () => 'The lending pool does not list this collateral.',
  BadValue: () => 'The transaction sent the wrong amount of native MON.',
  Shortfall: (a) => `The vault and the buffer do not cover the loan. Missing ${fmtToken(a[0] as bigint, 6)} USDC.`,
}

/** Turns wallet, RPC and contract errors into one plain sentence. */
export function explain(e: unknown): string {
  if (e instanceof BaseError) {
    if (e.walk((x) => x instanceof UserRejectedRequestError)) return 'You rejected the request in your wallet.'
    const rev = e.walk((x) => x instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null
    const name = rev?.data?.errorName
    if (name && bucketErrors[name]) return bucketErrors[name](rev?.data?.args ?? [])
    if (rev?.reason) return `The contract refused: ${rev.reason}`
    if (name) return `The contract refused with ${name}.`
    return e.shortMessage
  }
  return e instanceof Error ? e.message : String(e)
}
