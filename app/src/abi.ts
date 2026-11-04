import { parseAbi } from 'viem'

// Bucket and factory: docs/build-spec.md section 3, exactly. Do not change without telling the other teams.
const bucketErrors = [
  'error NotOwner()',
  'error NotFactory()',
  'error AlreadyOpen()',
  'error Closed()',
  'error NoRuleTriggered()',
  'error TipTooHigh()',
  'error Shortfall(uint256 missing)',
] as const
// Not in the spec interface, seen in contracts/src. Only used to decode reverts into plain words.
const implErrors = [
  'error BufferTooLarge()',
  'error NotAdmin()',
  'error VaultNotAllowed()',
  'error WrongVaultAsset()',
  'error UnsupportedCollateral()',
  'error BadValue()',
] as const

export const bucketAbi = parseAbi([
  'struct Rules { uint64 deadline; uint64 minHealth; uint16 tipBps; }',
  'function owner() view returns (address)',
  'function factory() view returns (address)',
  'function pool() view returns (address)',
  'function collateral() view returns (address)',
  'function debtAsset() view returns (address)',
  'function vault() view returns (address)',
  'function MAX_TIP_BPS() view returns (uint16)',
  'function rules() view returns (uint64 deadline, uint64 minHealth, uint16 tipBps)',
  'function opened() view returns (bool)',
  'function closed() view returns (bool)',
  'function position() view returns (uint256 collateralAmount, uint256 vaultShares, uint256 vaultAssets, uint256 idleDebtAsset, uint256 debt, uint256 healthFactor)',
  'function canExit() view returns (bool ok, uint8 reason)',
  'function open(uint256 collateralAmount, uint256 borrowAmount, uint256 bufferAmount)',
  'function setRules(Rules r)',
  'function exit()',
  'function rescue(address token)',
  'event Opened(uint256 collateralAmount, uint256 borrowed, uint256 deposited, uint256 shares)',
  'event RulesSet(uint64 deadline, uint64 minHealth, uint16 tipBps)',
  'event Exited(address indexed caller, uint8 reason, uint256 debtRepaid, uint256 collateralToOwner, uint256 debtAssetToOwner, uint256 tip)',
  ...bucketErrors,
  ...implErrors,
])

export const factoryAbi = parseAbi([
  'struct Rules { uint64 deadline; uint64 minHealth; uint16 tipBps; }',
  'function pool() view returns (address)',
  'function wmon() view returns (address)',
  'function isVaultAllowed(address vault) view returns (bool)',
  'function allowedVaults() view returns (address[])',
  'function bucketsOf(address owner) view returns (address[])',
  'function allBuckets() view returns (address[])',
  'function createAndOpen(address collateral, address vault, uint256 collateralAmount, uint256 borrowAmount, uint256 bufferAmount, Rules rules) payable returns (address bucket)',
  'function setVaultAllowed(address vault, bool allowed)',
  'event Created(address indexed owner, address indexed bucket, address collateral, address vault)',
  // createAndOpen runs Bucket.open in the same tx, so its errors can bubble up here.
  ...bucketErrors,
  ...implErrors,
])

// Aave V3 Pool: only what the app uses. getReserveData returns ReserveDataLegacy, same layout from v3.0 to v3.5+.
export const poolAbi = parseAbi([
  'struct ReserveConfigurationMap { uint256 data; }',
  'struct ReserveDataLegacy { ReserveConfigurationMap configuration; uint128 liquidityIndex; uint128 currentLiquidityRate; uint128 variableBorrowIndex; uint128 currentVariableBorrowRate; uint128 currentStableBorrowRate; uint40 lastUpdateTimestamp; uint16 id; address aTokenAddress; address stableDebtTokenAddress; address variableDebtTokenAddress; address interestRateStrategyAddress; uint128 accruedToTreasury; uint128 unbacked; uint128 isolationModeTotalDebt; }',
  'function getReserveData(address asset) view returns (ReserveDataLegacy)',
  'function getUserAccountData(address user) view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)',
  'event LiquidationCall(address indexed collateralAsset, address indexed debtAsset, address indexed user, uint256 debtToCover, uint256 liquidatedCollateralAmount, address liquidator, bool receiveAToken)',
])

// AaveOracle: USD prices with 8 decimals.
export const oracleAbi = parseAbi(['function getAssetPrice(address asset) view returns (uint256)'])

// ERC-20 and ERC-4626 fragments.
export const erc20Abi = parseAbi([
  'function symbol() view returns (string)',
  'function name() view returns (string)',
  'function decimals() view returns (uint8)',
  'function balanceOf(address owner) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
])

// Testnet only: the team's TestWETH mints 1 tWETH to the caller.
export const testWethAbi = parseAbi(['function faucet()'])

// Morpho Vault V2 shares have 18 decimals while USDC has 6, so always read decimals(). Never gate on maxDeposit (0 on V2).
export const vaultAbi = parseAbi([
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function asset() view returns (address)',
  'function totalAssets() view returns (uint256)',
])
