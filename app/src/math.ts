// Pure bigint money math for previews and the crash verdict. No imports so node --test can run it directly.
// Prices are AaveOracle USD values with 8 decimals; health factors are wad (1e18 = 1.00); LTV/thresholds are bps.

export const WAD = 10n ** 18n

/** Health factor (wad) as text, truncated to 2 decimals like the agent: 0.999 shows "0.99", never "1.00". */
export function truncHf(v: bigint): string {
  const c = v / 10n ** 16n
  return `${c / 100n}.${String(c % 100n).padStart(2, '0')}`
}
const BPS = 10_000n
const pow10 = (d: number) => 10n ** BigInt(d)

/** LTV, liquidation threshold and liquidation bonus (all bps) from Aave's ReserveConfigurationMap bitmap. */
export function decodeReserveConfig(data: bigint) {
  return { ltv: data & 0xffffn, liqThreshold: (data >> 16n) & 0xffffn, liqBonus: (data >> 32n) & 0xffffn }
}

export type Market = {
  collateralPrice: bigint
  debtPrice: bigint
  collateralDecimals: number
  debtDecimals: number
  ltv: bigint
  liqThreshold: bigint
}

/** Health factor right after opening a fresh position: collateral value * threshold / debt value. */
export function healthAfterOpen(m: Market, collateral: bigint, borrow: bigint): bigint | undefined {
  if (borrow === 0n || m.debtPrice === 0n) return undefined
  return (collateral * m.collateralPrice * m.liqThreshold * pow10(m.debtDecimals) * WAD) /
    (pow10(m.collateralDecimals) * BPS * borrow * m.debtPrice)
}

/** Collateral price (8-decimal USD) at which health reaches 1.00. */
export function liquidationPrice(m: Market, collateral: bigint, borrow: bigint): bigint | undefined {
  if (collateral === 0n || m.liqThreshold === 0n) return undefined
  return (borrow * m.debtPrice * pow10(m.collateralDecimals) * BPS) /
    (pow10(m.debtDecimals) * collateral * m.liqThreshold)
}

/** Largest borrow Aave allows (LTV), and the largest that keeps health at or above `floor` (wad, 0 = no floor). */
export function borrowLimits(m: Market, collateral: bigint, floor: bigint) {
  const value = collateral * m.collateralPrice * pow10(m.debtDecimals)
  const denom = pow10(m.collateralDecimals) * BPS * m.debtPrice
  if (denom === 0n) return { byLtv: 0n, byFloor: undefined }
  return {
    byLtv: (value * m.ltv) / denom,
    byFloor: floor === 0n ? undefined : (value * m.liqThreshold * WAD) / (denom * floor),
  }
}

/** Collateral a liquidator received above the value of the debt it repaid (collateral units). */
export function liquidationBonusTaken(
  liquidatedCollateral: bigint, debtCovered: bigint, collateralPrice: bigint, debtPrice: bigint,
  collateralDecimals: number, debtDecimals: number,
): bigint {
  if (collateralPrice === 0n) return 0n
  const debtInCollateral = (debtCovered * debtPrice * pow10(collateralDecimals)) / (collateralPrice * pow10(debtDecimals))
  return liquidatedCollateral - debtInCollateral
}

/** Bucket equity in 8-decimal USD: collateral + vault assets + buffer - debt. */
export function equityUsd(
  p: { collateralAmount: bigint; vaultAssets: bigint; idleDebtAsset: bigint; debt: bigint },
  collateralPrice: bigint, debtPrice: bigint, collateralDecimals: number, debtDecimals: number,
): bigint {
  return (p.collateralAmount * collateralPrice) / pow10(collateralDecimals) +
    ((p.vaultAssets + p.idleDebtAsset - p.debt) * debtPrice) / pow10(debtDecimals)
}
