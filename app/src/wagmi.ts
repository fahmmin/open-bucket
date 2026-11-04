import { createConfig, http, injected } from 'wagmi'
import { POLL_MS, RPC_URL, chain } from './config'

// Reads go to VITE_RPC_URL (mainnet, the local fork or testnet). Wallet transactions go through the wallet's own RPC.
export const wagmiConfig = createConfig({
  chains: [chain],
  connectors: [injected()],
  multiInjectedProviderDiscovery: false,
  transports: { [chain.id]: http(RPC_URL) },
  pollingInterval: POLL_MS,
})

declare module 'wagmi' {
  interface Register {
    config: typeof wagmiConfig
  }
}
