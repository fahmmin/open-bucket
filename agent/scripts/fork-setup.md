# Fork demo setup (local anvil fork of Monad mainnet)

The deploy part lives with the contracts team. This file says what the agent expects and in which order.

## Order

1. Start the fork (from `agent/`). Mixed mining gives a block every second, so the agent log ticks, and mines
   each transaction at once:
   ```
   npm run fork:start -- --block-time 1 --mixed-mining
   ```
2. Fund the demo accounts and deploy. Both are owned by the contracts team, in `open-bucket/contracts`:
   - `script/fork-fund.sh` gives anvil accounts WETH by impersonating aWETH. The liquidator is anvil
     account #3 `0x90F79bf6EB2c4f870365E785982E1f101E93b906` and needs WETH.
   - `forge script script/ForkSetup.s.sol --rpc-url http://127.0.0.1:8545 --broadcast --slow` deploys the
     factory, opens the bucket (account #1) and the identical plain Aave position (account #2), then writes
     `contracts/fork-demo.json`.
   - **TODO (contracts):** as of this writing, `ForkSetup.s.sol` still uses WMON, which is not an Aave Monad
     reserve. It must switch to WETH (`0xEE8c0E9f1BFFb4Eb878d8f15f368A02a35481242`), and `fork-fund.sh`
     does not exist yet.
3. Start the agent on the fork. It reads `factory`, `plainPosition` (and `collateral` if that is an address)
   from `contracts/fork-demo.json`. Those values beat `.env` on the fork.
   ```
   RPC_URL=http://127.0.0.1:8545 DRY_RUN=0 PRIVATE_KEY=<any burner> LIQUIDATE_PLAIN=1 npm start
   ```
   On start it gives the keeper 1000 MON of gas on the fork. The liquidator (account #3) supplies WETH and
   borrows enough USDC to repay the plain position's whole debt. Wait for the `liquidator ... ready` line.
4. Save the reset point once everything above is done:
   ```
   curl -X POST http://127.0.0.1:8787/fork/snapshot
   ```
   The id goes to `agent/fork/.snapshot`. `POST /fork/reset` reverts to it and immediately takes a new one,
   because anvil snapshots are single-use.

## Demo

- `curl -X POST -H "content-type: application/json" -d '{"pct":-4}' http://127.0.0.1:8787/fork/price`
  moves WETH down 4%. The first call replaces the code at `AaveOracle.getSourceOfAsset(WETH)` with
  `fork/MockFeed.sol`, seeded with the live price and decimals first.
- The bucket exits when its health drops below its floor. The plain position is liquidated below 1.00.
  Both show up on `GET /events`.
- `curl -X POST http://127.0.0.1:8787/fork/reset` puts everything back.

## Rebuilding the mock

`fork/out/` is committed, so forge is only needed if `fork/MockFeed.sol` changes:
`~/.foundry/bin/forge build --root fork`

## Seen while testing

On a cold fork, a few first-touch transactions (createAndOpen, borrow) reverted once and then passed on a
re-run. That happens while anvil is still lazily fetching state from rpc.monad.xyz, which allows 25 rps.
Do one warm-up run, or set `MONAD_RPC_URL` to a higher-limit provider.
