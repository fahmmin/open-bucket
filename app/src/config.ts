import { getAddress, isAddress, type Address, type Chain } from 'viem'
import { monad, monadTestnet } from 'viem/chains'

const env = import.meta.env

/** Reads an address from env. Bad values are dropped (with a console warning) so the UI shows "not set". */
function addr(name: string, value: string | undefined): Address | undefined {
  const v = value?.trim()
  if (!v) return undefined
  if (!isAddress(v, { strict: false })) {
    console.warn(`${name} is not a valid address: ${v}`)
    return undefined
  }
  return getAddress(v)
}

/** 143 = Monad mainnet (or a local anvil fork of it), 10143 = Monad testnet. */
export const CHAIN_ID = Number(env.VITE_CHAIN_ID?.trim() || monad.id)
export const IS_TESTNET = CHAIN_ID === monadTestnet.id
if (CHAIN_ID !== monad.id && !IS_TESTNET) console.warn(`VITE_CHAIN_ID=${CHAIN_ID} is not supported, using Monad mainnet (143).`)
// viem ships both chains with multicall3. Their public rpcUrls stay untouched, so "Switch network" never adds localhost to a wallet.
export const chain: Chain = IS_TESTNET ? monadTestnet : monad

export const RPC_URL: string = env.VITE_RPC_URL?.trim() || (IS_TESTNET ? 'https://testnet-rpc.monad.xyz' : 'https://rpc.monad.xyz')
/** True when the app reads from a local fork (anvil). Drives the fork banner and the crash screen. */
export const IS_FORK = /^(https?|wss?):\/\/(127\.0\.0\.1|localhost|\[::1\])(:|\/|$)/i.test(RPC_URL)
export const NETWORK_NAME = IS_FORK ? 'Local fork of Monad' : IS_TESTNET ? 'Monad testnet' : 'Monad mainnet'

/** Aave is not deployed on Monad testnet. There the team deploys an Aave-compatible test pool with the same ABI. */
export const LENDER = IS_TESTNET ? 'Open Bucket test pool' : 'Aave'
/** The lender inside a sentence ("supply WETH to the Open Bucket test pool"). */
export const LENDER_REF = IS_TESTNET ? 'the Open Bucket test pool' : 'Aave'
export const ORACLE_NAME = IS_TESTNET ? 'the test pool oracle' : 'AaveOracle'

/** VITE_AGENT_URL=off (public deployments): never call a local agent, so browsers don't ask for local-network access. */
export const AGENT_OFF = env.VITE_AGENT_URL?.trim() === 'off'
export const AGENT_URL: string = (env.VITE_AGENT_URL?.trim() || 'http://localhost:8787').replace(/\/+$/, '')
export const AGENT_SSE: string = env.VITE_AGENT_SSE?.trim() || 'http://localhost:8787/events'
/** MonadVision base URL. Links use /address/<a> and /tx/<hash>. */
export const EXPLORER: string = (env.VITE_EXPLORER?.trim() || (IS_TESTNET ? 'https://testnet.monadvision.com' : 'https://monadvision.com')).replace(/\/+$/, '')

// Open Bucket deployment (written by the contracts team after deploy).
export const FACTORY = addr('VITE_FACTORY', env.VITE_FACTORY)
// Crash screen (fork only): a plain Aave position and a bucket opened with the same amounts by `fork:setup`.
export const PLAIN_POSITION = addr('VITE_PLAIN_POSITION', env.VITE_PLAIN_POSITION)
export const DEMO_BUCKET = addr('VITE_DEMO_BUCKET', env.VITE_DEMO_BUCKET)

// Lending pool, oracle and tokens. All env-driven so one build runs on mainnet, the local fork and testnet.
// Chain 143 (mainnet and the fork) defaults to the VERIFIED values in docs/onchain-facts.md (read 2026-11-04).
// Testnet (10143) has no defaults: Aave is not deployed there, so set the team's test pool, oracle and TestWETH.
const MAINNET = CHAIN_ID === monad.id
/** Aave V3 Pool. Source: docs/onchain-facts.md 1a "POOL", VERIFIED [AB] and PAP.getPool(). */
export const AAVE_POOL = addr('VITE_AAVE_POOL', env.VITE_AAVE_POOL || (MAINNET ? '0x69a5F9AD4f96ebf0a0C792dD42a01cC5C0102fef' : undefined))
/** AaveOracle, getAssetPrice in USD with 8 decimals. Source: docs/onchain-facts.md 1a "ORACLE (AaveOracle)", VERIFIED. */
export const AAVE_ORACLE = addr('VITE_AAVE_ORACLE', env.VITE_AAVE_ORACLE || (MAINNET ? '0x0c02b2c2038066C10Eab8fe1D5Cdb73d5a78A1Bf' : undefined))
/** USDC, 6 decimals, the debt asset. Source: docs/onchain-facts.md "Tokens", VERIFIED. */
export const USDC = addr('VITE_USDC', env.VITE_USDC || (MAINNET ? '0x754704Bc059F8C67012fEd69BC8A327a5aafb603' : undefined))
/** Collateral: WETH, 18 decimals (WMON is not an Aave Monad reserve). Source: docs/onchain-facts.md "Tokens" and 1b, VERIFIED. On testnet: TestWETH with faucet(). */
export const COLLATERAL = addr('VITE_COLLATERAL', env.VITE_COLLATERAL || (MAINNET ? '0xEE8c0E9f1BFFb4Eb878d8f15f368A02a35481242' : undefined))

/** Health ruler range from the spec: 0.90 to 1.60. */
export const RULER_MIN = 0.9
export const RULER_MAX = 1.6
/** Bucket.MAX_TIP_BPS per spec section 3 (50 = 0.5%). The bucket screen reads the real value from the contract. */
export const SPEC_MAX_TIP_BPS = 50
/** How often reads refresh (ms). About two Monad blocks; the public RPC should not be hit harder. */
export const POLL_MS = 1000

/** Lists config values that are missing, so screens can say exactly what to set. */
export function missing(entries: Record<string, unknown>): string[] {
  return Object.entries(entries).filter(([, v]) => !v).map(([k]) => k)
}
