import { parseAbi } from 'viem'

// Exact signatures from docs/build-spec.md section 3 (only what the agent calls or decodes).
export const bucketAbi = parseAbi([
  'function rules() view returns (uint64 deadline, uint64 minHealth, uint16 tipBps)',
  'function closed() view returns (bool)',
  'function position() view returns (uint256 collateralAmount, uint256 vaultShares, uint256 vaultAssets, uint256 idleDebtAsset, uint256 debt, uint256 healthFactor)',
  'function canExit() view returns (bool ok, uint8 reason)',
  'function exit()',
  'error NotOwner()',
  'error NotFactory()',
  'error AlreadyOpen()',
  'error Closed()',
  'error NoRuleTriggered()',
  'error TipTooHigh()',
  'error Shortfall(uint256 missing)',
])

export const factoryAbi = parseAbi([
  'function allBuckets() view returns (address[])',
])

export const multicall3Abi = parseAbi(['function getCurrentBlockTimestamp() view returns (uint256 timestamp)'])

// Aave V3 fragments (the real Pool on the mainnet fork, or our Aave-compatible test pool on testnet).
export const poolAbi = parseAbi([
  'function getUserAccountData(address user) view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)',
  'function liquidationCall(address collateralAsset, address debtAsset, address user, uint256 debtToCover, bool receiveAToken)',
  'function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)',
  'function borrow(address asset, uint256 amount, uint256 interestRateMode, uint16 referralCode, address onBehalfOf)',
])

export const oracleAbi = parseAbi([
  'function getSourceOfAsset(address asset) view returns (address)',
  'function getAssetPrice(address asset) view returns (uint256)',
])

export const erc20Abi = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function deposit() payable', // WMON
])

// Our Aave-compatible test oracle on Monad testnet (POST /testnet/price)
export const testOracleAbi = parseAbi(['function setAssetPrice(address asset, uint256 price)'])

// fork/MockFeed.sol
export const feedAbi = parseAbi([
  'function decimals() view returns (uint8)',
  'function set(int256 answer, uint8 decimals_)',
])
