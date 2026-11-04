# Open Bucket

Exit rules for your DeFi loan. A bucket is one contract that holds your Aave loan and the vault deposit
you made with the borrowed USDC, plus your exit rules ("exit if health falls below 1.15", "exit by Friday").
An agent checks every Monad block and calls `exit()` when a rule is true: the contract redeems the vault,
repays Aave, withdraws your collateral and sends it to you. The agent can only trigger the exit and earn a
capped tip; it can never send funds anywhere but the owner.

Built at Monad Blitz Mumbai, 4 November 2026.

**Live (Monad testnet): https://openbucketmonad.vercel.app** · Code: https://github.com/fahmmin/open-bucket · Logos: `app/public/brand/`

## Results

- **Crash demo on a fork of Monad mainnet (real Aave V3 + real Morpho vault).** Same position twice, WETH
  falling 4% per step. The plain Aave position was liquidated and lost **0.0417 WETH** ($64 at the liquidation
  price) to the liquidation bonus. The bucket's agent exited one rule-crossing earlier, paid a **0.0020 WETH**
  tip, repaid 2,600.33 USDC and returned **1.9980 WETH** to the owner.
- **Live on Monad testnet.** The agent exited a real bucket at its deadline about 1.3 s after the rule fired
  (tx `0x8691f3ca6257d62e8234a70db48082d72650163423167eb95f95dfb4b1d2cd82`). All 6 testnet contracts are
  verified on Sourcify (exact match).
- **Tests.** 15 local contract tests plus 4 against the real Aave V3 market on a mainnet fork; 14 agent tests;
  5 app tests; 5 Synpress MetaMask end-to-end tests (connect, open, My money, exit, guard rail).
- **A real bug found by testing against real contracts:** the Morpho vault rounds redemptions down, so an exit
  in the same block as the open was 2 micro-USDC short. Exits now repay what they hold and leave the rounding
  dust (at most 0.01 USDC) on Aave with a sliver of collateral.

## Screens

| Screen | Route | What it answers |
|---|---|---|
| Landing | `/` | What Open Bucket is, live rates, proof, competitors, roadmap |
| Discover | `#discover` | Where should your borrowed dollars go? All 10 real Monad USDC vaults, net of Aave's borrow cost, with plain-word risk labels (exit speed, earns or loses, who runs it) |
| My money | `#home` (or `#home-<address>` read-only) | What is my money doing? Equity, earnings estimate, agent heartbeat, lowest health, activity, better-route nudges |
| Bucket | `#bucket-<address>` | What it holds, what it owes, health ruler, exit rules, agent log, history |
| Crash demo | `#crash` | What happens when the price falls, with and without a bucket (fork only) |

## Who does what today

Every lender built its own permission system and none spans two protocols. DeFi Saver and Summer.fi automate
the loan only and are not on Monad. Gearbox credit accounts are closest, but the debt must come from Gearbox.
Curvance, Morpho, Euler and Aave each automate inside their own walls. Enso and LI.FI do one-shot zaps that
nothing watches afterwards. Brahma and Instadapp use permissioned executors you have to trust, and are not on
Monad. Hackathon prototypes (Hodler Vault 2022, Cushion 2025) explored the idea as pooled vaults or trusted
keepers. Open Bucket is your own account with your own rules, an exit anyone can trigger but only you get paid
by, and it runs on Monad. Details: `docs/research-report.md` and `docs/demo-plan.html`.

## What is real

| Piece | Where it runs | Notes |
|---|---|---|
| `Bucket` + `BucketFactory` | Monad testnet (live) and a local fork of Monad mainnet | Same code in both places |
| Lending | **Real Aave V3 Monad** on the fork; Open Bucket **test pool** on testnet | Aave is not deployed on Monad testnet, so the testnet uses an Aave-compatible test pool (same function signatures). The app labels it on screen. |
| Yield | **Real Morpho vault** (SharpByte USDC High Yield) on the fork; a plain ERC-4626 test vault on testnet | |
| Collateral | WETH (Aave Monad does not list WMON); test WETH with a public faucet on testnet | |
| Price crash in the demo | Fork only: the agent swaps the oracle source's code for a settable feed | Clearly labelled on screen |

## Addresses

Monad testnet (chain 10143), deployed 4 Nov 2026, see `contracts/deployments/testnet.json`:

| Contract | Address |
|---|---|
| BucketFactory | `0x941Fb69F3b87315de42Ca06AEB5d8C4109685102` |
| TestPool (Aave stand-in) | `0x7CD5378302AF1086DbA7C6E4D3610e63ef71F55c` |
| TestOracle | `0xb462642086474956f572bD5D9c5352F9FFe51548` |
| TestWETH (public `faucet()`) | `0x11e65932196B07617180A8Fc5D1885BFd1170e9F` |
| TestUSDC | `0x21369835194F59E895636F92359dE3C3241997Ab` |
| TestVault (ERC-4626) | `0x99699EebD54435077F612938Cd3dD250d2f92bc2` |

Monad mainnet protocols used on the fork (verified onchain, see `docs/onchain-facts.md`): Aave V3 Pool
`0x69a5F9AD4f96ebf0a0C792dD42a01cC5C0102fef`, AaveOracle `0x0c02b2c2038066C10Eab8fe1D5Cdb73d5a78A1Bf`,
WETH `0xEE8c0E9f1BFFb4Eb878d8f15f368A02a35481242`, USDC `0x754704Bc059F8C67012fEd69BC8A327a5aafb603`,
SharpByte USDC vault `0xf57E9898575fab80b0f2aCDe5443276BeC8C542D`.

## Layout

```
contracts/  Foundry: Bucket, BucketFactory, testnet stack (src/testnet), tests, deploy + fork scripts
agent/      Node 24 + viem keeper: watches every block, sends exit(), SSE log, fork/testnet demo endpoints
app/        Vite + React + wagmi, Tiller-style shell in Monad purple: Landing (root), Discover (#discover),
            My money (#home, or #home-<address> read-only), Bucket (#bucket-<address>), Crash demo (#crash)
e2e/        Synpress (MetaMask) wallet tests against the local fork: connect, open, My money, exit, guard rail
```

## Tests

```bash
cd contracts
forge test --match-contract BucketLocalTest                       # 15 tests, no RPC, includes the crash side by side
forge test --match-contract BucketForkTest --fork-url https://rpc.monad.xyz   # 4 tests against real Aave V3 + Morpho
cd ../agent && npm test                                           # keeper decision logic and helpers
cd ../app && npm test && npm run build                            # money math, zero TS errors
cd ../e2e && npm run cache && npm test                            # Synpress MetaMask flows (needs the fork demo running)
```

Synpress notes: its cache CLI refuses Windows, so `npm run cache` builds the MetaMask cache with Synpress's
own functions (`e2e/scripts/build-cache.ts`). Pinned to Synpress 4.1.1 (MetaMask 11.9.1) and Playwright 1.48.2,
because 4.1.2's helpers still target MetaMask 11. Run the suite at the fork's starting price (POST
`/fork/reset` first): the open test expects health above 1.5.

Clone with submodules (`git clone --recursive https://github.com/fahmmin/open-bucket`, or `git submodule update --init`).
Foundry 1.8+ is required (`~/.foundry/bin` on this machine). The fork suite needs `--fork-url` so Foundry
selects Monad's EVM.

## Run the fork demo (real Aave, local)

```bash
cd agent && npm run fork:start -- --block-time 1 --mixed-mining          # terminal 1: anvil fork, chain 143
cd contracts && bash script/fork-fund.sh                                 # WETH for anvil accounts #0-#3
forge script script/ForkSetup.s.sol --rpc-url http://127.0.0.1:8545 --broadcast --slow
cd ../agent && CHAIN_ID=143 RPC_URL=http://127.0.0.1:8545 DRY_RUN=0 LIQUIDATE_PLAIN=1 \
  PRIVATE_KEY=<anvil test key #4> npm start                              # terminal 2: agent on :8787
curl -X POST http://127.0.0.1:8787/fork/snapshot                         # reset point
cd ../app && npm run dev:fork                                            # terminal 3: app on :5173
```

Then open http://localhost:5173/#crash, press "Drop price 4%" until both positions resolve, and "Reset".
If `ForkSetup` prints new addresses, copy `factory` and `bucket` into `app/.env.fork`.

## Run on Monad testnet

```bash
cd agent && CHAIN_ID=10143 RPC_URL=https://testnet-rpc.monad.xyz FACTORY=0x941Fb69F3b87315de42Ca06AEB5d8C4109685102 \
  AAVE_POOL=0x7CD5378302AF1086DbA7C6E4D3610e63ef71F55c AAVE_ORACLE=0xb462642086474956f572bD5D9c5352F9FFe51548 \
  COLLATERAL=0x11e65932196B07617180A8Fc5D1885BFd1170e9F USDC=0x21369835194F59E895636F92359dE3C3241997Ab \
  DRY_RUN=0 PORT=8788 PRIVATE_KEY=<your testnet burner> npm start
cd ../app && npm run dev:testnet                                         # app on :5174
```

## Known limits (said out loud in the pitch)

- No swaps: if the vault returns less than the debt, `exit()` stops with `Shortfall`. Rounding dust up to
  0.01 USDC is handled (repays what it holds and leaves a matching sliver of collateral on Aave). Next step:
  flash-loan exits; Aave Monad has flash loans enabled (5 bps).
- One lender (Aave) in the MVP. Any ERC-4626 vault works on the yield side; the factory admin allowlists vaults
  and has no power over buckets.
- Not audited. Testnet and fork only; nothing is deployed on mainnet.

## Docs

- `docs/runbook.md`: the 3-minute show, second by second, with fallbacks and judge Q&A
- `docs/demo-plan.html`: the plan we showed the Monad team (open it in a browser)
- `docs/onchain-facts.md`: every Monad mainnet address and parameter we rely on, verified onchain
- `docs/mainnet.md`: what a mainnet deployment costs (about 1 MON of gas) and the exact steps
- `docs/research-report.md`: the opportunity and competitor research behind the idea
- `docs/liquidations.md`: Aave V3 Monad liquidations measured over 35 hours (there were none in that window)
