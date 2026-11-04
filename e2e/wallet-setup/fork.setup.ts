import { defineWalletSetup } from '@synthetixio/synpress'
import { MetaMask } from '@synthetixio/synpress/playwright'

// Anvil's public test mnemonic only (account #0 = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266). Never a real key.
export const SEED_PHRASE = 'test test test test test test test test test test test junk'
// Password of the throwaway MetaMask profile inside .cache-synpress.
export const PASSWORD = 'Tester@1234'

export default defineWalletSetup(PASSWORD, async (context, walletPage) => {
  const metamask = new MetaMask(context, walletPage, PASSWORD)
  await metamask.importWallet(SEED_PHRASE)
  await metamask.addNetwork({ name: 'Monad fork', rpcUrl: 'http://127.0.0.1:8545', chainId: 143, symbol: 'MON' })
  await metamask.switchNetwork('Monad fork')
})
