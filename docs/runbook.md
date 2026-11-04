# Open Bucket stage runbook (3 minutes)

Two people. **Speaker** talks and keeps time. **Driver** clicks and never talks.
Slides: https://claude.ai/artifact/J2RddLRBV1SqBmG924skhJ (speaker notes hold every line).

## 30 minutes before: start the stack (4 terminals, from `open-bucket/`)

1. Fork of Monad mainnet (real Aave V3 + Morpho):
   `cd agent && npm run fork:start -- --block-time 1 --mixed-mining`
2. Demo positions (only on a fresh fork):
   `cd contracts && bash script/fork-fund.sh && forge script script/ForkSetup.s.sol --rpc-url http://127.0.0.1:8545 --broadcast --slow`
   If it prints a new factory or bucket address, update `app/.env.fork` (VITE_FACTORY, VITE_DEMO_BUCKET).
3. Fork agent with liquidator on :8787 (anvil test key #4 as keeper):
   `cd agent && CHAIN_ID=143 RPC_URL=http://127.0.0.1:8545 DRY_RUN=0 LIQUIDATE_PLAIN=1 PRIVATE_KEY=$(cast wallet private-key --mnemonic "test test test test test test test test test test test junk" --mnemonic-index 4) npm start`
   Wait for `liquidator ... ready`, then save the reset point: `curl -X POST http://127.0.0.1:8787/fork/snapshot`
4. Testnet agent on :8788 (your testnet burner from the root `.env`): see README "Run on Monad testnet".
5. Apps: `cd app && npm run dev:fork` (:5173) and `npm run dev:testnet` (:5174).

Checks: http://127.0.0.1:8787/health and :8788/health say `"ok":true`; the crash screen shows both
positions at health 1.49; the fork banner is orange; Wi-Fi plus a phone hotspot ready; notifications off;
browser zoom 125%.

## Tabs, left to right

1. Slides, cover slide.
2. App on the fork, Discover: http://localhost:5173/#discover (then the owner's dashboard:
   http://localhost:5173/#home-0x70997970C51812dc3A010C7d01b50e0d17dc79C8)
3. App on the fork, Crash: http://localhost:5173/#crash
4. Slides, "trust" slide (same deck, second window or just page forward in tab 1).
5. App on testnet, the closer bucket (link printed by step below).

## 3 minutes before walking on

`cd contracts && bash script/testnet-closer.sh 170`
Opens a testnet bucket whose deadline lands about 2:45 into the talk. Open the printed
`http://localhost:5174/#bucket-0x...` link in tab 5.

## On stage

| Time | Driver | Speaker |
|---|---|---|
| 0:00 | Slide 1 | The 3am story (speaker notes) |
| 0:20 | stay | One line: what Open Bucket is |
| 0:35 | Tab 2 Discover. Point at the top card, then at August's "Exit: limited" row | "Where should your borrowed dollars go? These are all 10 real USDC vaults on Monad, after Aave's borrow cost. This one pays more, but it can't always pay out at once, so our agent won't use it. Top pick: earns 3.7% and can always pay out." |
| 0:50 | Same tab: open the owner's dashboard (#home link) | "And this is what you come back to: what your money earns, and the agent checking it every block." |
| 1:00 | Tab 3 Crash. Press "Drop price 4%", wait until the price changes (~2 s), press again: 10 presses. A press while the last one is still landing is ignored, so watch the percentage | "Same position twice. Watch the right side exit by itself." |
| ~1:45 | stop when both columns resolve | Read the verdict: 0.042 WETH lost vs a 0.002 WETH tip |
| 1:50 | Slides: trust | "The agent can only press exit, and only you get paid." |
| 2:05 | Slides: competitors | "Everyone does a piece. DeFi Saver and Summer.fi aren't on Monad and never touch your yield. Gearbox needs its own debt. Nobody watches both sides." |
| 2:25 | Slides: why Monad | $788M lending, no automation, next-block exits |
| 2:40 | Tab 5 testnet bucket | "Live on Monad testnet. Its deadline just passed and our agent closed it on its own." Point at the Exited entry and its tx |
| 2:55 | Slides: close | "Open Bucket. Exit rules for your DeFi loans." |

Between rehearsals: press "Reset" on the crash screen, reload every app tab (so no tab keeps pre-reset
numbers), and run `testnet-closer.sh` again.

If a judge says "this already exists": "People have prototyped it since 2022 (Hodler Vault, Cushion), and on
Ethereum there are bots you have to trust (Brahma, DeFi Saver, Instadapp). Nobody has shipped the version where
the bot needs no permission and can only pay you, and nobody has shipped any of it on Monad."

## If something breaks

- Crash screen error or a frozen fork: say "here's the same run recorded an hour ago" and play the backup
  recording. Do not debug on stage.
- Testnet slow: skip the closer and say the testnet contracts are verified on Sourcify; show the README table.
- Wallet popups never appear on stage: nothing in the 3-minute show needs MetaMask.

## Questions you will get (one-line answers)

- **Why not DeFi Saver?** It isn't on Monad, and it manages the loan only. It can't pull your borrowed USDC back out of another protocol to repay.
- **Can the agent rob me?** No. It can only call exit, only while your rule is true, and the contract sends everything to the owner. Fuzz-tested.
- **What if the vault can't pay out in time?** Exit stops with a clear error and nothing moves. Next step: flash-loan exits (Aave Monad has them on, 5 bps).
- **Why a fork for the crash?** You can't move ETH's real price. The fork runs the real Aave and Morpho contracts, and it's labelled on screen.
- **Why WETH, not MON?** Aave Monad doesn't list MON yet. The same bucket works with any collateral Aave lists.
- **Is it live?** Yes, on Monad testnet with verified contracts. Aave isn't deployed on testnet, so lending there uses our Aave-compatible test pool.
- **Could this run elsewhere?** Yes, on any EVM chain with Aave. We built it on Monad because the lending money is here and nobody automates it yet.
