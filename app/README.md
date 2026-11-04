# Open Bucket app

Vite + React + TypeScript, wagmi v2 + viem + TanStack Query, injected wallet only. Plain CSS in the Monad brand
(dark only). Hash routes: `#routes` (default), `#bucket-<address>`, `#crash` (fork only), `#sample` (layout check).

## Run

```sh
npm install
cp .env.example .env     # then fill VITE_FACTORY (and the testnet/fork values if you use them)
npm run dev              # http://localhost:5173
npm run build            # tsc --noEmit, then vite build into dist/
npm test                 # bigint math self-check (node --test)
```

Vite reads `.env` at start, so restart `npm run dev` after editing it.

## Env

| Var | Default | What it does |
|---|---|---|
| `VITE_CHAIN_ID` | `143` | 143 = Monad mainnet or a local fork of it; 10143 = Monad testnet. The wrong-network prompt switches the wallet to this chain. |
| `VITE_RPC_URL` | `https://rpc.monad.xyz` (143), `https://testnet-rpc.monad.xyz` (10143) | All reads. `127.0.0.1`/`localhost` turns on the orange fork banner and `#crash`. |
| `VITE_EXPLORER` | `https://monadvision.com` / `https://testnet.monadvision.com` | Links use `/address/<a>` and `/tx/<hash>`. Fork-only tx hashes are shown without a link. |
| `VITE_FACTORY` | none | Open Bucket factory. Routes come from `allowedVaults()`, "Your buckets" from `bucketsOf(you)`. |
| `VITE_AAVE_POOL` | Aave V3 Pool `0x69a5…2fef` on 143 | `getReserveData`, `getUserAccountData`, `LiquidationCall` logs. On testnet: the team's test pool. |
| `VITE_AAVE_ORACLE` | AaveOracle `0x0c02…A1Bf` on 143 | `getAssetPrice` (USD, 8 decimals). |
| `VITE_USDC` | `0x7547…b603` on 143 | Debt asset (6 decimals). |
| `VITE_COLLATERAL` | WETH `0xEE8c…1242` on 143 | Collateral (18 decimals). On testnet: TestWETH with `faucet()`. |
| `VITE_AGENT_URL` | `http://localhost:8787` | `GET /yields`, `POST /fork/price {pct}`, `POST /fork/reset`. |
| `VITE_AGENT_SSE` | `http://localhost:8787/events` | Agent log stream. |
| `VITE_PLAIN_POSITION`, `VITE_DEMO_BUCKET` | none | Crash screen: the plain Aave account and the bucket opened by `fork:setup`. |

Chain 143 defaults are the VERIFIED values in `docs/onchain-facts.md` (2026-11-04). Testnet has no defaults on
purpose: Aave is not deployed there.

## What each screen reads

Reads poll about once a second (`refetchInterval` 1000 ms; the header block number uses wagmi's watch). Every
number on screen is a contract read or a named API; nothing is hard-coded. `#sample` is the only exception and it
carries a sticky "Sample data" banner plus a large "Sample data" label, and its buttons cannot send anything.

**Routes** (`#routes`)
- `factory.allowedVaults()`; per vault `name()`, `asset()` (must equal USDC), `totalAssets()` (vault size), `symbol()`.
- `Pool.getReserveData(USDC).currentVariableBorrowRate` (ray, shown as APR %), `Pool.getReserveData(collateral).configuration`
  (LTV bits 0-15, liquidation threshold 16-31, bonus 32-47, active 56, frozen 57).
- `AaveOracle.getAssetPrice(collateral)` and `(USDC)`, token `decimals()`/`symbol()`.
- Vault APY: `${VITE_AGENT_URL}/yields` (DefiLlama via the agent). Matched by vault address in `pool`/`poolMeta`,
  else by a unique `symbol` match (DefiLlama pool ids are UUIDs); otherwise "not available".
- Form: collateral `balanceOf`/`allowance(you, factory)`. Step 1 `approve(factory, amount)` ("Approve WETH", skipped
  when the allowance covers it). Step 2 `factory.createAndOpen(collateral, vault, amount, borrow, buffer, rules)` with
  `value: 0`, then it jumps to `#bucket-<address>` from the `Created` event. Preview: health after open, liquidation
  price and the safe borrow limit = min(LTV limit, the borrow that keeps health above the exit line).
- Testnet only: "Get 1 test WETH" calls `TestWETH.faucet()`.

**Bucket** (`#bucket-<address>`)
- `owner, collateral, debtAsset, vault, MAX_TIP_BPS` once; `position(), rules(), canExit(), opened(), closed()` every second.
- Equity = collateral x price + vault assets + buffer - debt, priced with `AaveOracle.getAssetPrice` (8 decimals).
- Health ruler 0.90-1.60 with marks at 1.00 and the owner's exit line. Rule chips: `canExit()` reason (1 deadline,
  2 health) plus the same check on the read values.
- "Exit now" (owner) calls `exit()`; a non-owner gets "Trigger exit for the tip" only while `canExit().ok`.
  "Edit rules" calls `setRules`. A warning shows when vault assets + buffer < debt (exit would hit `Shortfall`).
- Agent log: `EventSource(VITE_AGENT_SSE)`, lines filtered to this bucket, newest first, at most 8. If the stream is
  down it says "Agent offline: exits still work, anyone can trigger them."
- History: public RPCs cap `eth_getLogs` at 100 blocks, so the app binary-searches the block where the bucket got
  code (Opened) and where `closed()` flipped (Exited), then reads logs for those blocks only (up to 900,000 blocks back).

**Crash** (`#crash`, only when `VITE_RPC_URL` is localhost)
- `Pool.getUserAccountData(VITE_PLAIN_POSITION)` vs the demo bucket's `position()`/`rules()`/`closed()`.
- Price: `AaveOracle.getAssetPrice(collateral)`, shown with the change since the screen opened or was reset.
- "Drop price 4%" -> `POST /fork/price {"pct": -4}`, "Reset" -> `POST /fork/reset`; errors are shown as returned.
- Verdict from logs since the fork block (`anvil_nodeInfo`): Aave `LiquidationCall` for the plain user (collateral
  taken above the debt repaid, priced at that block) and the bucket's `Exited` (tip, debt repaid, collateral returned).

## Stable names for the Synpress tests

"Connect wallet" (becomes the short address), `data-testid="route-row"` with "Choose route", `data-testid="open-form"`
with labels "WETH to supply", "USDC to borrow", "Exit if health falls below", "Exit by (optional)", "Tip for the agent (%)",
buttons "Approve WETH" and "Open bucket"; bucket heading "Your bucket" (when you own it), headings "What it holds" /
"What it owes", `data-testid="bucket-health"`, `data-testid="bucket-status"` ("Open" / "Closed"), "Exit now", history
entries "Opened" / "Exited". Pending buttons read "Confirm in your wallet", then "Waiting for confirmation". Errors use
`role="alert"`.

## Known limits

- On the fork, wallet transactions still go through the wallet's own RPC (mainnet), so the crash demo is driven by the
  agent endpoints, not by wallet buttons.
- The Shortfall message assumes a 6-decimal debt asset (USDC).
