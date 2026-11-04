// Run with: npm test  (Node 24 strips the types)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { borrowLimits, decodeReserveConfig, equityUsd, healthAfterOpen, liquidationBonusTaken, liquidationPrice, truncHf, type Market } from './math.ts'

// The plan page example: 1,000 MON at $2.00, 1,000 USDC loan, threshold 75%.
const m: Market = { collateralPrice: 2_00000000n, debtPrice: 1_00000000n, collateralDecimals: 18, debtDecimals: 6, ltv: 7000n, liqThreshold: 7500n }
const mon = (n: number) => BigInt(n) * 10n ** 18n
const usdc = (n: number) => BigInt(Math.round(n * 1e6))

test('health is truncated, never rounded up', () => {
  assert.equal(truncHf(999n * 10n ** 15n), '0.99')
  assert.equal(truncHf(14999n * 10n ** 14n), '1.49')
  assert.equal(truncHf(10n ** 18n), '1.00')
  assert.equal(truncHf(115n * 10n ** 16n), '1.15')
})

test('decodes the Aave reserve bitmap', () => {
  const data = 7000n | (7500n << 16n) | (10750n << 32n) | (18n << 48n)
  assert.deepEqual(decodeReserveConfig(data), { ltv: 7000n, liqThreshold: 7500n, liqBonus: 10750n })
})

test('health after open and liquidation price', () => {
  assert.equal(healthAfterOpen(m, mon(1000), usdc(1000)), 15n * 10n ** 17n) // 1.50
  assert.equal(liquidationPrice(m, mon(1000), usdc(1000)), 1_33333333n) // $1.3333
  assert.equal(healthAfterOpen(m, mon(1000), 0n), undefined)
})

test('borrow limits', () => {
  const { byLtv, byFloor } = borrowLimits(m, mon(1000), 115n * 10n ** 16n)
  assert.equal(byLtv, usdc(1400))
  assert.equal(byFloor, 1304_347826n) // 2000 * 0.75 / 1.15
  assert.equal(borrowLimits(m, mon(1000), 0n).byFloor, undefined)
})

test('liquidation bonus and equity', () => {
  // Liquidator repays 500 USDC at MON $1.30 and takes 413.46 MON: 384.615384 MON covers the debt.
  const bonus = liquidationBonusTaken(41346n * 10n ** 16n, usdc(500), 1_30000000n, 1_00000000n, 18, 6)
  assert.equal(bonus, 41346n * 10n ** 16n - 384615384615384615384n)
  const eq = equityUsd({ collateralAmount: mon(1000), vaultAssets: usdc(992.4), idleDebtAsset: usdc(10), debt: usdc(1000.31) }, m.collateralPrice, m.debtPrice, 18, 6)
  assert.equal(eq, 2002_09000000n)
})
