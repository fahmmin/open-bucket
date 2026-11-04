# Open Bucket agent (keeper)

Watches every bucket from the factory on each Monad block. When a bucket's `canExit()` is true onchain,
it calls `exit()` once. It also streams a log over SSE, serves DefiLlama yields, and runs the fork demo helpers.
Node 24 runs the TypeScript directly (type stripping, no build step). The only dependency is viem.

```
npm install
cp .env.example .env      # then edit
npm test                  # node:test, decide() and helpers
npm start                 # or: npm run dev (restarts on change)
npm run fork:start        # anvil --fork-url $MONAD_RPC_URL --port 8545 --chain-id 143
```

## How it works

- Each block (websocket `newHeads` if `WS_URL` is set, else HTTP polling every 400 ms, or 250 ms on a local
  fork), the agent makes **one** Multicall3 call (`0xcA11bde05977b3631167028862bE2a173976CA11`). That call reads
  the block timestamp, `factory.allBuckets()`, and `position()`, `rules()`, `closed()`, `canExit()` for every
  open bucket. With the liquidator on, it also reads `Pool.getUserAccountData(PLAIN_POSITION)`. New buckets
  join the next block's batch. Closed buckets are dropped for good.
- `src/decide.ts` mirrors `Bucket.canExit()`: deadline first, then health. It produces the log line. Sending
  follows `canExit().ok` from the contract, and the agent warns if the two ever disagree.
- `exit()` is sent at most once per bucket, using an in-flight set. A failure (revert, `Shortfall(...)`, RPC
  error) clears it, so the next block retries.
- RPC errors back off from 0.5 s up to 15 s, and the agent keeps running. If the websocket fails, it falls
  back to HTTP polling.

## Environment (`.env`, see `.env.example`)

| Var | Meaning |
|---|---|
| `CHAIN_ID` | `143` Monad mainnet (default, also the fork) or `10143` testnet |
| `RPC_URL` | HTTP RPC. Defaults to the chain's public RPC. On `127.0.0.1`/`localhost` the agent treats it as an anvil fork |
| `WS_URL` | Optional, e.g. `wss://rpc.monad.xyz` |
| `FACTORY` | BucketFactory. Empty means watch nothing. On the fork it is read from `contracts/fork-demo.json` |
| `DRY_RUN` | `1` = log decisions only. The keeper and liquidator never send (the price endpoints still act when you call them) |
| `PRIVATE_KEY` | Burner that pays for `exit()`. Required unless `DRY_RUN=1`. Never logged |
| `PORT` | Default `8787` |
| `AAVE_POOL`, `AAVE_ORACLE`, `COLLATERAL`, `USDC` | On chain 143 they default to the VERIFIED values in `docs/onchain-facts.md` (collateral = WETH). On testnet, set them to TestPool, TestOracle, TestWETH, TestUSDC |
| `LIQUIDATE_PLAIN`, `PLAIN_POSITION` | Plain-position liquidator, fork or testnet only |
| `LIQUIDATOR_KEY` | Testnet liquidator key. It must hold TestWETH (`faucet()`), which it supplies to borrow USDC. The fork uses anvil account #3 |
| `ORACLE_ADMIN_KEY` | Testnet only. TestOracle owner, enables `POST /testnet/price` |
| `MONAD_RPC_URL` | Upstream for `fork:start` |

## Endpoints (http://localhost:8787)

| Route | What |
|---|---|
| `GET /events` | SSE. The last 50 events are replayed on connect. Each `data:` line is JSON `{ t, block, bucket, health, deadlineIn, decision, reason?, tx?, error? }`. `t` is ms since epoch. `health` is a 2-decimal string, truncated (`"1.42"`), and `"Infinity"` with no debt. `deadlineIn` is seconds, negative once passed, or `null` with no deadline rule. `decision` is `hold`, `exit`, `sent`, `confirmed`, `error`, or `liquidated` (the plain position, `bucket` = `PLAIN_POSITION`) |
| `GET /health` | `{ ok, block, buckets, dryRun }` |
| `GET /yields` | DefiLlama `/pools` rows with `chain === "Monad"`, fields as DefiLlama sends them, cached 10 min. `502 {error}` if DefiLlama fails. Rows are never made up |
| `POST /fork/price` `{pct}` | Fork only. Moves the collateral's Aave oracle price by `pct` % (compounding) via a mock feed on its oracle source |
| `POST /fork/snapshot` | Fork only. Saves the reset point (`fork/.snapshot`) |
| `POST /fork/reset` | Fork only. `evm_revert` to the reset point, then takes a fresh snapshot |
| `POST /testnet/price` `{pct}` | `CHAIN_ID=10143` and `ORACLE_ADMIN_KEY` only. `TestOracle.setAssetPrice(COLLATERAL, price * (100+pct)/100)` |

Fork setup and demo steps: [scripts/fork-setup.md](scripts/fork-setup.md).

## Safety rules

- **Fork-only endpoints.** `/fork/*` returns 403 unless `RPC_URL`'s host is `127.0.0.1` or `localhost`.
  `/testnet/price` returns 403 unless the chain is 10143 and `ORACLE_ADMIN_KEY` is set. The liquidator never
  runs on mainnet.
- **Loopback only.** The server binds `127.0.0.1`, and CORS allows only `localhost`/`127.0.0.1` origins.
  The POST endpoints have no auth.
- **Dry run.** With `DRY_RUN=1` the agent never sends on its own: no exits, no liquidations, no liquidator
  setup. Use it first against mainnet.
- **Gas limit.** Monad charges for the gas limit, so every transaction is sent with `estimateGas * 1.2`,
  never a large fixed limit.
- **Keys.** Keys are read from env and never logged (not even an invalid one). Error messages leave out RPC
  URLs, which can carry API keys. Use a burner for `PRIVATE_KEY`.
- **The agent can only call `exit()`.** The contract decides whether it may, and pays the owner.
