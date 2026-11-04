# Open Bucket wallet E2E (Synpress + MetaMask)

End-to-end tests that drive the real app with a real MetaMask extension against the local Monad fork.
Its own npm package, so the app's dependencies stay untouched.

- `@synthetixio/synpress` **4.1.1** (MetaMask **11.9.1**) and `@playwright/test` **1.48.2**, the version Synpress pins
  (`playwright-core` 1.48.2 in `@synthetixio/synpress-cache`).
- Why not 4.1.2: it downloads MetaMask 13.13.1, but its helpers still drive MetaMask 11 screens.
  `importWallet` stops on "Your wallet is ready!", and `addNetwork` / `switchNetwork` wait for
  `[data-testid="network-display"]`, which MetaMask 13 removed
  ([synpress#1308](https://github.com/Synthetixio/synpress/issues/1308)).
- Wallet: only anvil's public test mnemonic (`test test ... junk`), account #0 `0xf39F…2266`.
  `wallet-setup/fork.setup.ts` imports it, adds `Monad fork` (`http://127.0.0.1:8545`, chain 143, MON) and switches to it.

## Prerequisites

These three must already be running. The tests never start, stop or reset them:

| Service | Where | Notes |
| --- | --- | --- |
| anvil fork of Monad mainnet | `http://127.0.0.1:8545` | chain id 143, 1-second blocks; account #0 holds MON for gas and WETH |
| keeper agent | `http://localhost:8787` | may exit a bucket whose rule is true; the tests use health ~2.4 with an exit line of 1.15, so it should not |
| app, fork mode | `http://localhost:5173` | `npm run dev:fork` in `../app` |

Also Node 22.18 or newer (the cache script is TypeScript run by Node directly), and Playwright's Chromium:
`npx playwright install chromium`.

## Run

```sh
npm install
npm run cache   # once: downloads MetaMask 11.9.1 from its GitHub release (~21 MB) and builds .cache-synpress/<hash>
npm test        # headed Chromium. For headless: HEADLESS=true npm test  (PowerShell: $env:HEADLESS='true'; npm test)
```

Rebuild the cache after you change `wallet-setup/fork.setup.ts`: `npm run cache -- --force`.
The cache folder is named after a hash of the setup function, and the fixtures look it up by that hash.

### Windows and the Synpress CLI

The official cache CLI (`npm run cache:cli`, which is `synpress ./wallet-setup`) refuses to run on Windows:

```
🚨 Sorry, Windows is currently not supported. Please use WSL instead! 🚨
```

`--force` and `--headless` do not change this: the check runs first. The test fixtures have no such check.
So `npm run cache` runs `scripts/build-cache.ts`, which does what the CLI does with Synpress's own pieces
(`prepareExtension` downloads and unpacks MetaMask, then the setup function runs in a persistent Chromium profile).
It works on every OS. On Linux, macOS or WSL, `npm run cache:cli` builds the same cache.

## What each test proves

All tests are in `tests/open-bucket.spec.ts`. Each one gets a fresh browser from the cache and connects MetaMask itself.

1. **connect**: "Connect wallet" in the header plus `metamask.connectToDapp()` turns the button into `0xf39F…2266`
   (title = the full address), the header shows "Local fork of Monad" and "chain 143", and there is no wrong-network bar.
2. **open a bucket**: on the first route that can be opened, 0.5 WETH to supply, 400 USDC to borrow, exit line 1.15.
   "Approve WETH" shows "Confirm in your wallet" until MetaMask approves (`approveTokenPermission`, because MetaMask
   shows `approve()` as a spending-cap screen), then "Open bucket" is confirmed with `confirmTransaction`.
   The URL becomes `#bucket-0x…`; the bucket screen says "Your bucket", status "Open", "What it holds" shows
   0.5000 WETH, health is above 1.5, and the history has "Opened".
3. **my money**: `#home` lists that bucket under "Your buckets", linking to `#bucket-<address>`, with its health.
4. **exit**: "Exit now" plus `confirmTransaction` turns the status to "Closed" and adds "Exited" to the history.
   Then, straight from the chain: `position()` debt is at most 10,000 (USDC dust) and account #0's WETH balance
   went up by at least 0.4999 WETH.
5. **guard rail**: 0.3 WETH with 2,000 USDC to borrow. Before approving, the form says
   "Health after: 0.xx, below your exit line". After approving, "Open bucket" is disabled and the form says
   "Aave lends at most … USDC against 0.3000 WETH."

Tests 2 to 4 run in order (serial) and share the bucket; if one fails, the rest of that group is skipped.

## Things to know

- The fork is never reset, so each run leaves state behind: one more closed bucket for account #0, a little MON
  spent on gas, and a 0.3 WETH allowance to the factory from the guard rail test (the open test approves 0.5 WETH
  again, so it always goes through the approve step).
- The app only enforces the borrow limit on step 2. On step 1 the button still offers "Approve WETH" for a borrow
  the lender will refuse; only the "Health after" line warns. That is why the guard rail test approves first.
- "Waiting for confirmation" is not asserted: with 1-second blocks it can disappear before a check sees it.
- After each MetaMask answer the specs wait for its popup to close. Otherwise the next `metamask.*` call can pick up
  the closing popup and fail with "Target page, context or browser has been closed".
- Failed tests keep a trace (`test-results/`, open with `npx playwright show-trace`). `video: 'retain-on-failure'` is
  set too, but Synpress launches its own persistent browser context, which Playwright's video recorder does not
  attach to, so no video is written.
