import {
  BaseError,
  ContractFunctionRevertedError,
  isAddress,
  maxUint256,
  type Abi,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from 'viem'

// Monad charges for the gas LIMIT, so send with estimate + 20%, never a large fixed limit.
export async function sendTx(
  client: PublicClient,
  w: WalletClient,
  req: { address: Address; abi: Abi; functionName: string; args?: readonly unknown[] },
): Promise<Hex> {
  const gas = await client.estimateContractGas({ ...req, account: w.account } as never)
  return w.writeContract({ ...req, account: w.account, chain: w.chain, gas: (gas * 12n) / 10n } as never)
}

export async function mined(client: PublicClient, hash: Hex) {
  const r = await client.waitForTransactionReceipt({ hash })
  if (r.status !== 'success') throw new Error(`transaction ${hash} reverted`)
  return r
}

// One SSE message. Only JSON-safe values (no bigint).
export type AgentEvent = {
  block: number
  bucket: string
  health: string | null // "1.42"; "Infinity" when there is no debt
  deadlineIn: number | null // seconds until the deadline (negative once passed); null = no deadline rule
  decision: 'hold' | 'exit' | 'sent' | 'confirmed' | 'error' | 'liquidated'
  reason?: string
  tx?: string
  error?: string
}

// Truncates to two decimals so 0.999 shows "0.99", never "1.00".
export const fmtHealth = (h: bigint) => (h === maxUint256 ? 'Infinity' : (Number(h / 10n ** 16n) / 100).toFixed(2))

// price * (100 + pct) / 100, with pct to two decimals (-4, 2.5).
export const applyPct = (price: bigint, pct: number) => (price * BigInt(Math.round((100 + pct) * 100))) / 10_000n

export function envAddress(name: string): Address {
  const v = process.env[name]
  if (!v || !isAddress(v)) throw new Error(`${name} must be set to an address (see docs/onchain-facts.md)`)
  return v
}

// Short, secret-free error text: decoded custom error (e.g. "Shortfall(1234)") or viem's short message.
// viem's shortMessage leaves out the request URL, which may carry an RPC API key.
export function errMsg(e: unknown): string {
  if (!(e instanceof BaseError)) return e instanceof Error ? e.message : String(e)
  const rev = e.walk((x) => x instanceof ContractFunctionRevertedError)
  if (rev instanceof ContractFunctionRevertedError && rev.data) return `${rev.data.errorName}(${(rev.data.args ?? []).join(', ')})`
  return e.shortMessage
}
