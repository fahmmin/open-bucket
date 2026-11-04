import type { Address } from 'viem'

export type ExitSpeed = 'Instant' | 'Limited' | 'Slow'
export type VaultInfo = {
  address: Address
  name: string
  /** Plain words for who runs it and what it charges, shown as a chip. */
  who: string
  protocol: string
  exit: ExitSpeed
  /** What the one-off liquidity check found. */
  exitNote: string
  /** DefiLlama pool id (docs/onchain-facts.md section 3), used to match the vault's yield. */
  llamaPool?: string
  /** waMonUSDC earns Aave's USDC supply rate, read onchain instead of from DefiLlama. */
  yieldFrom?: 'aave-supply'
}

/** Exit speed is a one-off check, not live: docs/onchain-facts.md section 2. */
export const EXIT_CHECKED = 'Exit speed checked 4 Nov 2026'

// Monad mainnet USDC ERC-4626 vaults. Source: docs/onchain-facts.md section 2 (addresses, type, fees,
// instant liquidity read at blocks 119,294,921-119,296,608). Instant = most of the vault can leave at once;
// Limited = only part of it; Slow = almost nothing.
export const MAINNET_VAULTS: VaultInfo[] = [
  { address: '0xf57E9898575fab80b0f2aCDe5443276BeC8C542D', name: 'SharpByte USDC High Yield', who: 'Run by SharpByte, 10% fee', protocol: 'Morpho Vault V2', exit: 'Instant', exitNote: 'About 1.49M of 1.54M USDC could leave at once', llamaPool: '4861b40b-9561-57e4-9938-31274e58d1a6' },
  { address: '0x80017bF0f793EBbE9679Cd61ff0e395B62CAbB59', name: 'August USDC V2', who: 'Run by August, 0.25% a year fee', protocol: 'Morpho Vault V2', exit: 'Limited', exitNote: 'About 1.07M of 10.49M USDC could leave at once', llamaPool: '0b033747-3a22-486b-a600-9958b878bef7' },
  { address: '0x91643f54C4F5F7559BD43a082eFF97594d16708C', name: 'Re Ecosystem Vault', who: 'Run by Re, 10% fee', protocol: 'Morpho Vault V2', exit: 'Limited', exitNote: 'About 562k of 1.24M USDC could leave at once' },
  { address: '0xdE16452C1f8CC209D8E9b104b7F240D9A251768B', name: 'August USPC', who: 'Run by August', protocol: 'Morpho Vault V2', exit: 'Limited', exitNote: 'About 170k of 1.90M USDC could leave at once' },
  { address: '0x78999cc96d2Ba0341588C60CcB0E91c6C33CF371', name: 'Hyperithm USDC Apex', who: 'Run by Hyperithm', protocol: 'Morpho Vault V2', exit: 'Slow', exitNote: 'Only 6.58 USDC could leave at once' },
  { address: '0x75753e494e5e374C52E1d84fc04EB14B10F2C079', name: 'Saturn USDC', who: 'Run by Saturn', protocol: 'Morpho Vault V2', exit: 'Slow', exitNote: 'Nothing could leave at once' },
  { address: '0xE1BcA19baA63894D374578320551633320436523', name: 'Clearstar Earn USDC', who: 'Run by Clearstar', protocol: 'Euler Earn', exit: 'Limited', exitNote: 'About 237k of 3.37M USDC could leave at once', llamaPool: 'd711af54-e736-470f-8a22-431a23de76df' },
  { address: '0xa3B64e2674463c98CbD21807055D8C1E008b6e79', name: 'Euler eUSDC-15', who: 'Euler EVK vault', protocol: 'Euler EVK', exit: 'Limited', exitNote: 'About 335k of 4.20M USDC could leave at once' },
  { address: '0x1905EDDF5943ef6C92Ccf1469bd40fC2cB4A77b0', name: 'Euler eUSDC-12', who: 'Euler EVK vault', protocol: 'Euler EVK', exit: 'Limited', exitNote: 'About 237k of 3.38M USDC could leave at once' },
  { address: '0xC554aFfE2f581F5E0811e0D42D484ECaC5c6B8e2', name: 'Wrapped Aave Monad USDC', who: 'Aave static aToken, no fee', protocol: 'Aave', exit: 'Instant', exitNote: 'About 10.3M USDC (Aave USDC available liquidity) could leave at once', yieldFrom: 'aave-supply' },
]

/** Testnet: the team's TestVault (OpenZeppelin ERC-4626 that keeps all its USDC), found through the factory allowlist. */
export const testVault = (address: Address): VaultInfo => ({
  address, name: 'Test vault', who: 'Open Bucket test vault, no fee', protocol: 'ERC-4626 test vault', exit: 'Instant',
  exitNote: 'Test vault on Monad testnet: it keeps all its USDC, so withdrawals are instant (contracts/src/testnet/TestVault.sol)',
})

/** Why a vault cannot be used yet, in plain words. */
export function viewOnlyReason(v: VaultInfo, allowed: boolean | undefined, hasFactory: boolean): string | undefined {
  if (allowed) return undefined
  if (!hasFactory) return 'No Open Bucket factory is set up yet, so nothing can be opened.'
  if (v.exit === 'Slow') return 'Withdrawals are not instant, so the agent could get stuck.'
  if (v.exit === 'Limited') return 'Only part of this vault can leave at once, so an exit could get stuck.'
  return 'Not on the Open Bucket allowlist yet.'
}
