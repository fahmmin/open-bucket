# Aave V3 liquidations on Monad mainnet (chain 143)

> **Pitch stat (measured):** In the last 35.2 hours (blocks 118902234-119319933, 2026-11-03 00:45:18 UTC to 2026-11-04 11:54:27 UTC), **0 Aave V3 liquidations** hit **0 unique borrowers** on Monad, and borrowers gave up about **$0.00 in liquidation bonuses** (collateral seized minus debt repaid, valued at current AaveOracle prices).
>
> Last ~24h only (blocks 119034776-119319933, 24.0 h): 0 liquidations, 0 unique borrowers, $0.00 in bonuses.

Status: **FINAL** (written 2026-11-04T12:00:00.695Z).

## Window

| | block | timestamp |
|---|---|---|
| oldest block fully scanned | 118902234 | 2026-11-03 00:45:18 UTC |
| newest block (head at scan start) | 119319933 | 2026-11-04 11:54:27 UTC |

Hours covered: **35.15 h** (1.46 days, 417700 blocks). Avg block time 0.303 s (measured over blocks 119219933-119319933). RPC calls: 4204, errors/retries: 10.

## Totals

| window | liquidations | unique borrowers | debt covered (USD) | collateral seized (USD) | bonus (USD) | bonus % of debt |
|---|---|---|---|---|---|---|
| full window (35.2 h) | 0 | 0 | $0.00 | $0.00 | $0.00 | - |
| last ~24h (blocks 119034776-119319933) | 0 | 0 | $0.00 | $0.00 | $0.00 | - |

## Per collateral asset (full window)

Sanity check: expected liquidator bonus % = config bonus x (1 - protocol fee share), because the event's collateral amount excludes the protocol's cut.

| collateral | liquidations | debt covered | collateral seized | bonus | measured bonus % | config bonus | protocol fee (share of bonus) | expected liquidator bonus % |
|---|---|---|---|---|---|---|---|---|
| (none) | | | | | | | | |

## 5 largest liquidations (by debt covered, USD)

| # | block | time | collateral -> debt | debt covered | collateral seized | bonus | bonus % | borrower | tx |
|---|---|---|---|---|---|---|---|---|---|
| (none) | | | | | | | | | |

## Prices used (AaveOracle.getAssetPrice at report time, 8-dec USD)

| asset | symbol | decimals | price (USD) |
|---|---|---|---|


## Method

1. `eth_getLogs` on Pool `0x69a5F9AD4f96ebf0a0C792dD42a01cC5C0102fef`, topic0 `0xe413a321e8681d831f4dbccbca790d2952b56f977908e45be37335533e005286` = keccak("LiquidationCall(address,address,address,uint256,uint256,address,bool)"), via https://rpc.monad.xyz. That RPC rejects ranges over 100 blocks, so the scan walks backwards from head in 100-block chunks (10 in flight, ~22 req/s, retry with backoff). Only the contiguous fully-scanned range is reported.
2. Decode per event: collateralAsset/debtAsset/user from topics; debtToCover and liquidatedCollateralAmount from data; token decimals/symbol via ERC-20 calls.
3. USD value = amount / 10^decimals x AaveOracle `0x0c02b2c2038066C10Eab8fe1D5Cdb73d5a78A1Bf` getAssetPrice / 1e8, at **current** prices (not the price at liquidation time). bonus_usd = collateral_usd - debt_usd. Unique borrowers = distinct `user` topic.
4. Config bonus and protocol fee read from Pool.getConfiguration (bits 32-47 and 152-167).

## Caveats

- Valued at current oracle prices, not at-liquidation prices. If collateral and debt prices moved differently since each liquidation, the measured bonus % drifts from the config value.
- The event's liquidatedCollateralAmount excludes the protocol's fee cut, so the bonus here is what liquidators received. Borrowers' true loss is higher by the protocol fee: estimated $0.00 more over the full window (debt_usd x config bonus x fee share; an estimate, not measured from events).
- Gross bonus: liquidator gas, swap slippage and flash-loan fees are not subtracted.
- One borrower can be liquidated several times; "liquidations" counts events, "unique borrowers" counts addresses.
- Window limited by time box and the 100-block getLogs cap; older liquidations are not included.

## Why the zero is real (positive control)

- Same Pool address, same RPC, same 100-block `eth_getLogs` calls, without the topic filter, returned live Pool events in recent blocks (topic0 `0x2b6277...` Supply and `0x804c9b84...` ReserveDataUpdated, checked 2026-11-04 11:58 UTC). So the address and log access work; the LiquidationCall filter simply matched nothing.
- topic0 computed with `cast keccak` on the exact signature. All 4,177 chunks in the window returned successfully (10 transient RPC errors, all retried; only the contiguous fully-scanned range is reported).
- The bonus % sanity check (e.g. WETH 5.5%) could not run because there were no events to compare.
- Not scanned: anything older than 2026-11-03 00:45 UTC (blocks below 118902234). Days 2-7 back were not reached inside the time box.
