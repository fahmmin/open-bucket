# Open Bucket — Monad mainnet (chain 143) onchain facts

Collected 2026-11-04, ~09:40–10:00 UTC. `eth_chainId` on https://rpc.monad.xyz returned `0x8f` (143).
Labels: **VERIFIED** = I made the onchain call or read an official source. **REPORTED** = secondary or derived source. **UNKNOWN** = not established.
Onchain reads are `eth_call`s (mostly batched through Multicall3 `aggregate3`) against https://rpc.monad.xyz at the block named in each section.
Observed block time is about 0.30 s (1,567 blocks in 474 s, from block timestamps). VERIFIED [RPC].

**Source keys**
- [AB] https://raw.githubusercontent.com/bgd-labs/aave-address-book/main/src/AaveV3Monad.sol (official Aave address book)
- [RPC] my own `eth_call` / `eth_getCode` on https://rpc.monad.xyz
- [MD-net] https://docs.monad.xyz/developer-essentials/network-information
- [MD-rpc] https://docs.monad.xyz/reference/json-rpc/overview (sections "Limits" and "WebSocket subscriptions")
- [MD-hist] https://docs.monad.xyz/developer-essentials/historical-data
- [MD-prov] https://docs.monad.xyz/tooling-and-infra/rpc-providers
- [MD-tok] https://docs.monad.xyz/developer-essentials/network-information/tokens-and-bridges
- [MD-fdry] https://docs.monad.xyz/tooling-and-infra/toolkits/foundry and https://docs.monad.xyz/guides/deploy-smart-contract/foundry
- [MORPHO-API] https://api.morpho.org/graphql (`vaultV2s` / `vaults`, `chainId_in: [143]`)
- [EULER-LBL] https://raw.githubusercontent.com/euler-xyz/euler-labels/master/143/earn-vaults.json
- [DL] https://yields.llama.fi/pools and https://yields.llama.fi/lendBorrow
- [UNI4] https://developers.uniswap.org/docs/protocols/v4/deployments (section "Monad: 143")
- [UNI3] https://developers.uniswap.org/docs/protocols/v3/deployments/v3-monad-deployments
- [UR-GH] https://github.com/Uniswap/universal-router/blob/main/deploy-addresses/monad.json
- [KYBER] https://docs.kyberswap.com/developer-guide/aggregator-api/contracts and https://docs.kyberswap.com/getting-started/supported-exchanges-and-networks
- [0X] https://github.com/0xProject/0x-settler/blob/master/chain_config.json (key `monad`) and https://docs.0x.org/docs/introduction/supported-chains
- [CL-RDD] https://reference-data-directory.vercel.app/feeds-monad-mainnet.json (Chainlink's feed directory, the data behind docs.chain.link)

**Tokens.** All VERIFIED: addresses from [MD-tok], decimals from `decimals()` [RPC].
USDC `0x754704Bc059F8C67012fEd69BC8A327a5aafb603` (6 decimals, Circle CCTP) · USDT0 `0xe7cd86e13AC4309349F30B3435a9d337750fC82D` (6) · AUSD `0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a` (6) · WETH `0xEE8c0E9f1BFFb4Eb878d8f15f368A02a35481242` (18) · cbBTC `0xd18B7EC58Cdf4876f6AFebd3Ed1730e4Ce10414b` (8)

---

## 1. Aave V3 Monad

### 1a. Core addresses
| Name | Address | Status / how |
|---|---|---|
| POOL_ADDRESSES_PROVIDER | `0x34793Fb9935F7bB5E5aE920fb963F39063E7A615` | VERIFIED [AB]; `getMarketId()` returns "Aave V3 Monad" [RPC] |
| POOL | `0x69a5F9AD4f96ebf0a0C792dD42a01cC5C0102fef` | VERIFIED [AB], matches `PAP.getPool()` [RPC] |
| POOL_CONFIGURATOR | `0xC7A386Da9cB528aa86feD862a7bf33d10AA8455B` | VERIFIED [AB], matches `PAP.getPoolConfigurator()` [RPC] |
| ORACLE (AaveOracle) | `0x0c02b2c2038066C10Eab8fe1D5Cdb73d5a78A1Bf` | VERIFIED [AB], matches `PAP.getPriceOracle()`; `BASE_CURRENCY_UNIT` = 1e8 (USD, 8 dec); fallback oracle = 0x0 [RPC] |
| ACL_MANAGER | `0xa9fEe192a76B8f5e5f3d310AB6C526cB11F3d95B` | VERIFIED [AB], matches `PAP.getACLManager()` [RPC] |
| ACL_ADMIN | `0xa9d0EAFF48cE1DF468f9eAeb7e628c413343F6A2` | VERIFIED [AB], matches `PAP.getACLAdmin()` [RPC] |
| AAVE_PROTOCOL_DATA_PROVIDER | `0xB65A68B98274ef7D9a60E0C0747dD1BEc3D32fad` | VERIFIED [AB], matches `PAP.getPoolDataProvider()` [RPC] |
| UI_POOL_DATA_PROVIDER | `0xa7D38785be3422c25677A8aa4a44D3a0853A3a17` | VERIFIED [AB]; has code (10,194 bytes) [RPC] |
| WETH_GATEWAY | `0x5bB847f1E529df8819038BA6d34a95c9C2FB6813` | VERIFIED [AB] only, not called |
| `Pool.POOL_REVISION()` | 11 | VERIFIED [RPC] |

### 1b. Reserves: `Pool.getReservesList()` returns 14 assets, and WMON is not one of them
VERIFIED [RPC] at block 119,293,354. The order below is the reserve id order. aToken and vToken come from `DataProvider.getReserveTokensAddresses`, the oracle from `AaveOracle.getSourceOfAsset`, and every one matches [AB].
| # | Asset | Underlying | aToken | vToken | Oracle source |
|---|---|---|---|---|---|
| 0 | USDT0 | `0xe7cd86e13AC4309349F30B3435a9d337750fC82D` | `0x9531E6bC99D7F7f0596ed7bA5b846Ba9Eb60468c` | `0x85812C8eEeB8723e3C60d0Dc78e697b4E7e5a35D` | `0x3c187a25f0f05E009DA794069682653e40062730` |
| 1 | USDC | `0x754704Bc059F8C67012fEd69BC8A327a5aafb603` | `0x35a73BAcb179d3740395A3ceCc87FF2e581d6042` | `0x9F555aB84C4e0a531B50283f09Dba7A97134c4e4` | `0x787962943811D279d01eC973Bd3A15f1b3e1F0D9` |
| 2 | USDe | `0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34` | `0x37cAbe3eDD86165886877Cc8b6Be10269f21893d` | `0x3BE6c069b81423BccF758eb95004E0324Af2cDD8` | `0x3abA25B23378A84FD7638E20F9Af86A66000f090` |
| 3 | mUSD | `0xacA92E438df0B2401fF60dA7E4337B687a2435DA` | `0xDBb2e1b6BC94328Df2662A1796AB6A23fCde3199` | `0x9837392b2b5b2Ce7C39A357E0eB6E07d9fFb76Cd` | `0xbbb58AA3a251c9f19653771c44481c39500b71A3` |
| 4 | AUSD | `0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a` | `0xdeBFeDF35faEd5d1664E553545e144C02227A2Ec` | `0x8F4c10B392ef10c811E4d4BAFC74Bfc1A2671C75` | `0x6b7c151653c35845a5826b15435fc055A9Db1D0C` |
| 5 | WETH | `0xEE8c0E9f1BFFb4Eb878d8f15f368A02a35481242` | `0x4377b53aAA8b8e3fF7AA2843832CAF004f5Cb8b6` | `0xd1f352c326731027f0d9a7f62a4742eBdf1EFc8c` | `0x47F1D18329Ae59341617B7a5BE59605B63f0e373` |
| 6 | cbBTC | `0xd18B7EC58Cdf4876f6AFebd3Ed1730e4Ce10414b` | `0x1F5e388861A32226c716e922CE748a6FEE5e8e57` | `0x551a5fc4a05efFC8F9A026F4DC28634D4693Af1F` | `0x48692d15DA2636E1b0335344104Ce9d92f231DdA` |
| 7 | wstETH | `0x10Aeaf63194db8d453d4D85a06E5eFE1dd0b5417` | `0xc31E3A273A93D238Ce49B053f801E8f385375df7` | `0xC4B1064b7377eF541d59B7e21C0B3F812C50d4Ec` | `0x7c1DbD7879C421ebd1A2dE397Ea6Bedb5D3795A5` |
| 8 | weETH | `0xA3D68b74bF0528fdD07263c60d6488749044914b` | `0x4FAe5e2d191e012f503dE53023B0710f554FcFF0` | `0x78540eD62E3F6081c906F7841A7e1A6201cb898E` | `0x53E2d62Cd8c36104DEC69bA0CB3Bb599d6D42FE1` |
| 9 | syrupUSDC | `0xaB6e5a0C3799d020c790D34F7B2C02639e238AF7` | `0xbc2A1FA0069e59e2552Ab40889520c7b0D413D9B` | `0xE84F9B29568747Cb58B2969071e38093A384E26f` | `0xB1f36c815761a3F77CE26c013F646cdCdCd06384` |
| 10 | sUSDe | `0x211Cc4DD073734dA055fbF44a2b4667d5E5fE5d2` | `0xCD11405D4a15a825B46254c42F5b5Cd8c2EDAe09` | `0x4cc35bFad4713705295Fd71DAE11CD57cc366Ca8` | `0x99946Fe1a49D8650a31eFE0fcFee0508892742f0` |
| 11 | GHO | `0xfc421aD3C883Bf9E7C4f42dE845C4e4405799e73` | `0x4586face17B0e3D4d51EcABb4B4EBC2354b61b0D` | `0x1dd98eDe37480c2E0827a107c68f442aA516E7fc` | `0x26cBccD96502D2EfDb612737bD6aECe19f65109c` |
| 12 | PT-AUSD-8OCT2026 | `0x9FC74f8Ed616B5BaF52a170caa97d6d3898602d1` | `0xb93Ce4EB85eBA317f954Dadcbe112Ce6c3af9ae4` | `0x4d2D334Ff7b0A82394bc95668d99369e9EE06748` | `0x6D8f31268E94Bec0b0E07bc06b561b8B749F3127` |
| 13 | PT-AUSD-17DEC2026 | `0x8B562578b2f9Aa8C14cCda3c5d6CBCEaD3B06a57` | `0x8F8d143F1FCe0A57A6e80D8DF7f7288703b2Eb7e` | `0x7C10Ebde9C6ba023d4410Da645E013Fd8677795e` | `0x4dc9Ee8d739411242303f7F78C6610d5B0371a2C` |

WMON check: `AaveOracle.getSourceOfAsset(WMON)` = `0x0000…0000` and `Pool.getReserveData(WMON)` is all zeros. VERIFIED [RPC]. There is no WBTC reserve; cbBTC is the only BTC asset.

### 1c. Key reserve parameters at block 119,293,354 (2026-11-04 09:40:11 UTC). All VERIFIED [RPC]
Sources: `DataProvider.getReserveConfigurationData / getReserveCaps / getReserveData / getFlashLoanEnabled / getPaused / getDebtCeiling` and `Pool.getVirtualUnderlyingBalance` (the "available" column). The `Pool.getConfiguration` bitmap (bits 56–63) was cross-checked for WETH, USDC and cbBTC.
LTV, liquidation threshold (LT) and bonus are in basis points. Caps are whole tokens. Rates are converted from ray as APR, with APY = (1 + APR/31,536,000)^31,536,000 − 1.
| Asset | LTV | LT | Bonus | Collateral | Borrowing | Flash | Supply cap | Borrow cap | Supplied | Borrowed | Available | Variable borrow rate (ray) → APR / APY | Supply APY |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| USDC | 0 | 7800 | 10750 | flag on, but LTV 0 | **yes** | yes | 350,000,000 | 148,000,000 | 131,988,875 | 121,663,332 | 10,325,787 | 54419694011306833969164728 → 5.44% / 5.59% | 4.62% |
| USDT0 | 0 | 7800 | 10750 | flag on, but LTV 0 | yes | yes | 200,000,000 | 63,000,000 | 63,722,885 | 58,441,441 | 5,281,575 | 49843256259023240264880291 → 4.98% / 5.11% | 4.20% |
| AUSD | 0 | 0 | 0 | no | yes | yes | 40,000,000 | 32,000,000 | 4,710,306 | 3,664,686 | 1,045,628 | 48625667537773032540984749 → 4.86% / 4.98% | 3.46% |
| GHO | 7500 | 7800 | 10750 | yes | yes | yes | 60,000,000 | 54,000,000 | 9,257,489 | 8,144,134 | 1,113,374 | 47811439399894366992607303 → 4.78% / 4.90% | 3.86% |
| mUSD | 0 | 0 | 0 | no | yes | yes | 50,000,000 | 40,000,000 | 41,243,052 | 30,897,370 | 10,345,740 | 46822015763516756105704763 → 4.68% / 4.79% | 3.21% |
| **WETH** | **8050** | **8400** | **10550** | **yes** | no (flag = 0) | yes | 10,000 | 7,500 | 1,742.54 | 1,540.46 | 202.08 | 21609644736655767123015574 → 2.16% / 2.18% | 1.64% |
| cbBTC | 7300 | 7800 | 10700 | yes | no (borrow cap 1) | yes | 400 | 1 | 3.743 | 0 | 3.743 | 0 | 0 |
| wstETH / weETH | 0 | 0 | 0 | no (eMode only) | no | yes | 9,200 / 10,300 | 1 / 1 | 0.05 / 1,470.60 | 0 | — | 0 | 0 |

- Reserve factors: USDC/USDT0/AUSD/mUSD/GHO 10%, WETH 15%, cbBTC 7%. VERIFIED.
- No reserve is paused, frozen or siloed, and every debt ceiling is 0, so nothing is in isolation mode. VERIFIED.
- AaveOracle prices at the same block (8 dec USD): WETH 231735441227 ($2,317.35), cbBTC 7837694532760 ($78,376.95), USDC 99980188 ($0.9998). VERIFIED.
- WETH has 1,540 WETH of variable debt even though `borrowingEnabled` is false. VERIFIED. Why is UNKNOWN; it does not affect borrowing USDC.
- **For Open Bucket:** against USDC outside eMode, the only volatile collateral with LTV > 0 is WETH (80.5%) and cbBTC (73%); GHO (75%) is the only stable one. wstETH and weETH have LTV 0 outside eMode. VERIFIED.

### 1d. Flash loans, eModes, oracles
- `Pool.FLASHLOAN_PREMIUM_TOTAL()` = **5** (bps, so 0.05%) and `FLASHLOAN_PREMIUM_TO_PROTOCOL()` = 10000 (the whole premium goes to the protocol). `getFlashLoanEnabled` = true on all 14 reserves. VERIFIED [RPC].
- eModes from `Pool.getEModeCategoryCollateralConfig / Label / CollateralBitmap / BorrowableBitmap`, VERIFIED [RPC]. Format: LTV / LT / bonus in bps.
  1 `syrupUSDC__Stablecoins` 9000/9200/10400, collateral syrupUSDC, borrows USDT0/USDC/mUSD/AUSD/GHO ·
  2 `USDe_sUSDe__Stablecoins` 9000/9200/10400, borrows USDT0/USDC/AUSD/GHO ·
  3 `wstETH__WETH` 9400/9600/10100 · 4 `weETH__WETH` 9300/9500/10100 ·
  5 `PT_Agora__Stablecoins` 9300/9500/10244 (PT-AUSD-8OCT2026) · 6 `PT_AUSD_17DEC2026__Stablecoins` 9300/9500/10236.
  No eMode accepts WETH or cbBTC as collateral.
- **WETH oracle source**, VERIFIED [RPC]: `0x47F1D18329Ae59341617B7a5BE59605B63f0e373`, description "ETH / USD (USD Scaled)", 8 dec. `latestRoundData()` **reverts**, so read `latestAnswer()` or `AaveOracle.getAssetPrice()`. Its `source()` is `0xce6538287b42d833f294662edad8b3da070c6902` ("ETH / USD", 18 dec), and that contract's `aggregator()` is `0xef3c6c938f82be8ba983a52f5b0f47ee820dceb2`. The same aggregator sits behind Chainlink's listed "ETH / USD" shared-SVR proxy `0x38057D0458ca56068e1A57E62D3874cA129A7A78` (18 dec) [CL-RDD]. It is not the 8-dec proxy 0x1B14…0A04.
- **WMON oracle source:** none (`0x0`), because WMON is not listed. VERIFIED.
- USDC source `0x7879…F0D9` reads "Capped USDC / USD"; cbBTC source `0x4869…1DdA` reads "CBBTC / USD (USD Scaled)". Both 8 dec. VERIFIED.

---

## 2. USDC ERC-4626 vaults
Candidates came from [MORPHO-API], [EULER-LBL] and [DL]. `asset()`, `totalAssets()`, `decimals()` and the gates were read with [RPC] at blocks 119,294,921–119,296,608.
How instant liquidity was computed:
- Morpho Vault V2: idle USDC plus min(the liquidity adapter's supply, market supply − market borrow) in the `liquidityData` market, read from Morpho Blue `market()` / `position()`.
- Euler Earn: the sum of `strategy.maxWithdraw(earnVault)`.
- Euler EVK: `cash()`.
- Aave: the reserve's available liquidity.
| Vault | Address | Type / curator | asset() | totalAssets | Instant liquidity | APY (REPORTED) | Verdict |
|---|---|---|---|---|---|---|---|
| **SharpByte USDC High Yield** (sbUSDC-hy-mon) | `0xf57E9898575fab80b0f2aCDe5443276BeC8C542D` | Morpho Vault V2, curator `0x73fceD2CB2432ff354ab29E9dDc1FbDB203D8fDA`, performance fee 10% | USDC ✓ | 1,544,903 | **~1,494,867** (≈97%) | 9.84% net [MORPHO-API]; 8.61% [DL] | **Pick #1** |
| **August USDC V2** (AugustUSDCv2) | `0x80017bF0f793EBbE9679Cd61ff0e395B62CAbB59` | Morpho Vault V2, curator `0xA81AE7d57D68Fd6eF76a3082134BD2F3019aec24`, management fee 79274479/s (≈0.25%/yr), performance fee 0 | USDC ✓ | 10,491,216 | **~1,072,242** (limited by market liquidity) | 9.58% net [MORPHO-API]; 9.52% [DL] | **Pick #2** |
| Re Ecosystem Vault | `0x91643f54C4F5F7559BD43a082eFF97594d16708C` | Morpho V2, performance fee 10% | USDC ✓ | 1,239,922 | ~561,771 | 3.85% [MORPHO-API] | below the $1M liquidity bar |
| August USPC | `0xdE16452C1f8CC209D8E9b104b7F240D9A251768B` | Morpho V2 | USDC ✓ | 1,899,266 | ~169,990 | 7.27% [MORPHO-API] | too illiquid |
| Hyperithm USDC Apex | `0x78999cc96d2Ba0341588C60CcB0E91c6C33CF371` | Morpho V2, `liquidityAdapter()` = 0x0 | USDC ✓ | 41,134,824 | **6.58 USDC idle only** | 9.59% [MORPHO-API] | **not instant**, avoid |
| Saturn USDC | `0x75753e494e5e374C52E1d84fc04EB14B10F2C079` | Morpho V2, `liquidityAdapter()` = 0x0 | USDC ✓ | 9,479,634 | 0 | 9.22% [MORPHO-API] | not instant, avoid |
| Clearstar Earn USDC (CSUSDC) | `0xE1BcA19baA63894D374578320551633320436523` | Euler Earn (3 strategies) | USDC ✓ | 3,369,522 | ~236,764 | 8.21% [DL] | too illiquid |
| EVK eUSDC-15 | `0xa3B64e2674463c98CbD21807055D8C1E008b6e79` | Euler EVK | USDC ✓ | 4,202,821 | cash 335,004 | 6.12% [DL] | too illiquid |
| EVK eUSDC-12 | `0x1905EDDF5943ef6C92Ccf1469bd40fC2cB4A77b0` | Euler EVK | USDC ✓ | 3,378,054 | cash 236,764 | 6.96% [DL] | too illiquid |
| Wrapped Aave Monad USDC (waMonUSDC, stataToken) | `0xC554aFfE2f581F5E0811e0D42D484ECaC5c6B8e2` | Aave static aToken ([AB] `USDC_STATA_TOKEN`) | USDC ✓ | 46,773,127 | ≈ Aave USDC available, 10.3M | ≈ Aave supply rate, 4.62% | deepest liquidity, but **negative carry** against the 5.44% borrow APR |

Vault details, VERIFIED [RPC] unless marked:
- **Morpho V2 traps.** `maxDeposit(0x…dEaD)` = 0 on both picks (waMonUSDC and Clearstar return non-zero), so do not gate deposits on `maxDeposit`. `maxRedeem` was only checked for a zero-balance address, where 0 is expected; its behaviour for real holders is UNKNOWN. Shares have 18 decimals while USDC has 6. All four gates (`receiveSharesGate`, `sendSharesGate`, `receiveAssetsGate`, `sendAssetsGate`) are 0x0 on the four adapter-backed V2 vaults, so anyone can deposit and redeem.
- **Liquidity markets.**
  - August USDC V2: market `0xc4504d2bf84ff1f6ff015afe00086226425dd5a626e096283504154a71821ec1` (collateral `0x103222f020e98Bba0AD9809A011FDF8e6F067496` = earnAUSD per [DL], LLTV 91.5%). The vault holds 10.49M of the market's 10.49M supply against 9.42M borrowed.
  - SharpByte: market `0x093bd94086b08a013c96dc0776ebf663e9300e742a2c14479211cc35da6c3439` (collateral `0xa08A69aB9Dd3B04D0992BC7aFb2c0b907bbdc147` = PT-USDAT-14JAN2027 per [DL], LLTV 91.5%). The market has 2.79M free.
  - These liquidity figures move every block with borrower activity.
- **Morpho Blue address.** Morpho Blue is `0xd5d960e8c380b724a48ac59e2dff1b2cb4a1eaee`: it is what the adapters' `morpho()` returns, and it has 15,582 bytes of code. VERIFIED onchain; I did not check it against Morpho's docs.
- **Morpho V1 (MetaMorpho).** The largest Monad V1 vault is $90k (Grove x Steakhouse High Yield AUSD), so V1 is not relevant. REPORTED [MORPHO-API].
- **Positive carry.** The two picks yield about 8.6–9.8% (REPORTED) against Aave USDC borrowing at 5.44% APR (VERIFIED), so the carry is positive, but each pick can only absorb about $1–1.5M of instant redemptions.

---

## 3. DefiLlama yields API
| Fact | Status |
|---|---|
| `GET https://yields.llama.fi/pools` returned HTTP 200 with no key or auth. Body `{status:"success", data:[…]}`, 15,977 pools, 254 with `chain=="Monad"`. About 10.9 MB raw, 2.3 MB with `--compressed` (brotli). The response carried an `Age: 1229` header, so it is CDN-cached. | VERIFIED (fetched) |
| `/pools` row fields: `chain, project, symbol, tvlUsd, apyBase, apyReward, apy, rewardTokens, pool, apyPct1D, apyPct7D, apyPct30D, stablecoin, ilRisk, exposure, predictions, poolMeta, mu, sigma, count, outlier, underlyingTokens, il7d, apyBase7d, apyMean30d, volumeUsd1d, volumeUsd7d, apyBaseInception` | VERIFIED |
| `GET https://yields.llama.fi/lendBorrow` returned HTTP 200 with no key: a plain array of 2,524 rows. Fields: `pool, apyBaseBorrow, apyRewardBorrow, totalSupplyUsd, totalBorrowUsd, debtCeilingUsd, ltv, borrowable, mintedCoin, rewardTokens, underlyingTokens, borrowFactor`. Join it to `/pools` on `pool`. | VERIFIED |
| The `pool` id is a UUID, not a contract address. Vault-to-row mapping below is by symbol/poolMeta. For lending pools `tvlUsd` = supply − borrow (Aave USDC: 10.6M against `totalSupplyUsd` 132.2M). | VERIFIED (data); mapping REPORTED |
| DefiLlama's Aave USDC `apyBaseBorrow` of 4.999 differs from the onchain 5.44% APR, so use onchain rates for logic. | VERIFIED (comparison) |

Example Monad rows (REPORTED [DL], fetched about 09:45 UTC):
| project / symbol | pool id | tvlUsd | apy (base + reward) | lendBorrow fields |
|---|---|---|---|---|
| aave-v3 USDC | `0a1131e6-a59d-537c-b18f-826b9583f01f` | 10,603,592 | 5.507 (4.138 + 1.368) | apyBaseBorrow 4.999, totalSupplyUsd 132,241,130, totalBorrowUsd 121,637,737, ltv 0, borrowable true |
| aave-v3 USDT0 | `8bba1554-1318-54ad-9143-0972406e9428` | 5,274,258 | 5.514 (4.114 + 1.400) | apyBaseBorrow 4.984, supply 63,634,417, borrow 58,360,268, ltv 0 |
| aave-v3 WETH | `7909e3f2-f00f-5e8e-9655-0d7e189794a3` | 468,732 | 2.737 (1.625 + 1.112) | apyBaseBorrow 2.161, ltv 0.805, borrowable false |
| morpho-blue AUGUSTUSDCV2 | `0b033747-3a22-486b-a600-9958b878bef7` | 10,388,388 | 9.516 (6.722 + 2.794) | not present in lendBorrow |
| morpho-blue SBUSDC-HY-MON | `4861b40b-9561-57e4-9938-31274e58d1a6` | 1,544,572 | 8.605 (6.575 + 2.030) | not present |
| euler-v2 USDC "Clearstar Earn USDC" | `d711af54-e736-470f-8a22-431a23de76df` | 3,368,822 | 8.212 (6.962 + 1.250) | not present |

---

## 4. Swap routers (WMON / WETH → USDC)
| Contract | Address | Status |
|---|---|---|
| Uniswap UniversalRouter (v4-era) | `0x0d97dc33264bfc1c226207428a79b26757fb9dc3` | VERIFIED [UNI4] [UNI3]; code 19,499 bytes [RPC] |
| Uniswap UniversalRouter 2.1.1 | `0xFdf682F51FE81Aa4898F0AE2163d8A55c127fbC7` | VERIFIED [UNI4] [UR-GH]; code 24,546 bytes |
| Uniswap UniversalRouter 2.1.2 | `0xa6CE4F10d83dBdDAc17E68e1837ca9cE6a1b596e` | VERIFIED [UNI4] [UR-GH]; code 24,380 bytes |
| Uniswap v4 Quoter / StateView / PositionManager | `0xa222dd357a9076d1091ed6aa2e16c9742dd26891` / `0x77395f3b2e73ae90843717371294fa97cc419d64` / `0x5b7ec4a94ff9bedb700fb82ab09d5846972f4016` | VERIFIED [UNI4] (not called) |
| Uniswap v3 SwapRouter02 | `0xfe31f71c1b106eac32f1a19239c9a9a72ddfb900` | VERIFIED [UNI3]; code 24,497 bytes; `factory()` = v3 factory and `WETH9()` = WMON [RPC] |
| Uniswap v3 Factory / QuoterV2 | `0x204faca1764b154221e35c0d20abb3c525710498` / `0x661e93cca42afacb172121ef892830ca3b70f08d` | VERIFIED [UNI3] + [RPC] |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` | VERIFIED [UNI4] [MD-net] |
| KyberSwap MetaAggregationRouterV2 | `0x6131B5fae19EA4f9D964eAc0408E4408b66337b5` | VERIFIED [KYBER] ("Monad (ChainID: 143)"); code 13,724 bytes [RPC] |
| KyberSwap AggregationExecutorProxy | `0x8F10B468b06c6FD214B65F87778827F7D113f996` | VERIFIED [KYBER]; code 13,529 bytes |
| 0x AllowanceHolder (spender for the 0x Swap API) | `0x0000000000001fF3684f28c67538d4D072C22734` | VERIFIED [0X] (`deployment.allowanceHolder`, plus the Monad row in the docs' Swap/Gasless table); code 1,009 bytes. The Settler address rotates, so take `transaction.to` from the API response. |
| Kuru Flow router | — | UNKNOWN. Per https://docs.monad.xyz/guides/kuru-flow the router comes back in the quote (`transaction.to`) and the API needs credentials. |

Liquidity reality check, VERIFIED [RPC] at block 119,295,279 (QuoterV2 `quoteExactInputSingle`):
- Uniswap v3 **WETH/USDC 0.3%** `0x25ef1a210ff55bcee9f8fee979aaff6bd1be5bf1` holds only 4,252 USDC + 3.89 WETH. 1 WETH quotes 2,162.14 USDC, about 6.7% below the oracle. Too thin.
- Uniswap v3 **WMON/USDC 0.3%** `0x659bd0bc4167ba25c62e05656f78043e7ed4a9da` holds 139,172 USDC + 37.33M WMON. 10,000 WMON quotes 184.71 USDC. The other fee tiers are near-empty.
- **KyberSwap API** (`GET https://aggregator-api.kyberswap.com/monad/api/v1/routes`, no key). 1 WETH quoted 2,320.60 USDC and 10 WETH quoted 23,201.94 USDC, routed through hanji, kuru-ob-v2, woofi-v3 and thog-prop; `routerAddress` = `0x6131…37b5`. VERIFIED (live API).
- Uniswap v4 pool liquidity for these pairs: UNKNOWN (not enumerated).

---

## 5. RPC, websockets, providers
| Endpoint (HTTPS / WSS) | Provider | Rate limit | Batch | Notes | Status |
|---|---|---|---|---|---|
| https://rpc.monad.xyz / wss://rpc.monad.xyz | QuickNode | 25 rps | 100 | `eth_getLogs` ≤ 100 blocks; `eth_call` gas 200M | VERIFIED [MD-net] [MD-rpc] |
| https://rpc1.monad.xyz / wss://rpc1.monad.xyz | Alchemy | 15 rps | 100 | `debug_`/`trace_` disabled; logs ≤ 1,000 blocks / 10k logs | VERIFIED [MD-net] [MD-rpc] |
| https://rpc2.monad.xyz / none listed | Goldsky Edge | 300 per 10 s | 10 | historical-state `eth_call` | VERIFIED [MD-net] |
| https://rpc3.monad.xyz / wss://rpc3.monad.xyz | Ankr | 300 per 10 s | 10 | `debug_` disabled; logs ≤ 1,000 blocks; `eth_call` gas 1B | VERIFIED [MD-net] [MD-rpc] |
| https://rpc-mainnet.monadinfra.com / wss://same | Monad Foundation | 20 rps | 1 | historical state for `eth_call`, `eth_getBalance`, `debug_traceCall` and others; logs ≤ 100 blocks | VERIFIED [MD-net] [MD-hist] |

- **wss works.** On both wss://rpc.monad.xyz and wss://rpc-mainnet.monadinfra.com I subscribed to `eth_subscribe ["newHeads"]` and `["monadNewHeads"]`, and both returned subscription ids. In 8 s I received about 24 `newHeads` and about 95 `monadNewHeads` updates (several per block, with `blockId` and `commitState`; I saw Finalized and Verified). VERIFIED (live test).
- **Subscription semantics** [MD-rpc]. `newHeads` and `logs` fire when a block is **Proposed** and speculatively executed. `monadNewHeads` and `monadLogs` add `blockId` and `commitState` updates (Proposed → Voted → Finalized → Verified; Voted can be skipped, and abandoned blocks get no event). `newPendingTransactions` and `syncing` are **not supported**. Connection and subscription limits are not documented, so UNKNOWN.
- **Historical-state probe.** `eth_call` `USDC.totalSupply()` from head 119,295,550 going back N blocks, VERIFIED [RPC]:
  - rpc.monad.xyz: OK at −1M, fails at −10M ("Block requested not found").
  - rpc3: fails at −1M.
  - rpc1, rpc2, monadinfra: OK at −10M.
  - [MD-hist] says full nodes keep "as many historical per-block state tries as" disk allows, about 40,000 blocks on a 2 TB SSD, so the depth is provider-dependent.
- **Providers listed for mainnet** in [MD-prov]: Alchemy, Ankr, Blockdaemon, BlockPI, BoltRPC, Chainstack, dRPC, Dwellir, Envio, GetBlock, Goldsky, Node101 (trace API), OnFinality, QuickNode, Spectrum, Tatum, thirdweb, Triton One, Validation Cloud. VERIFIED. That page never mentions "archive", so per-provider archive or fork guarantees are UNKNOWN.

---

## 6. Foundry
| Fact | Status |
|---|---|
| Minimum version: **Foundry v1.8.0+** ("first-class Monad execution support across Forge, Anvil, Cast, Chisel, traces, and cheatcodes") | VERIFIED [MD-fdry] |
| Enable with `network = "monad"` in `foundry.toml` or `--network monad` per command. The default hardfork is `MonadTen`; pin with `hardfork = "monad:MonadNine"` or `--hardfork`. Limits are 128 KB code and 256 KB initcode. | VERIFIED [MD-fdry] |
| Anvil: `anvil --network monad` (local) and `anvil --fork-url https://rpc.monad.xyz` (mainnet fork); the hardfork is auto-detected from the chain id | VERIFIED [MD-fdry] |
| Install: `curl -L https://foundry.paradigm.xyz \| bash`, restart the shell, then `foundryup`. On **Windows it needs Git Bash or WSL**; "PowerShell and Command Prompt are not supported" | VERIFIED https://getfoundry.sh/introduction/installation/ |
| Template `forge init --template monad-developers/foundry-monad`. Its `foundry.toml` still points at **testnet** (`https://testnet-rpc.monad.xyz`, chain_id 10143), so override it for mainnet. | VERIFIED [MD-fdry] + https://raw.githubusercontent.com/monad-developers/foundry-monad/main/foundry.toml |
| Foundry is not installed on this machine, so local version and fork behaviour are untested | UNKNOWN |

---

## 7. Chainlink feed liveness (read at block 119,294,248, 2026-11-04 09:44:41 UTC)
| Feed | Proxy | Decimals | `latestRoundData` answer | updatedAt (UTC) | Age | Heartbeat / deviation [CL-RDD] | Status |
|---|---|---|---|---|---|---|---|
| ETH / USD | `0x1B1414782B859871781bA3E4B0979b9ca57A0A04` | 8 | 231660034248 ($2,316.60) | 09:44:12 | 29 s | 3600 s / 0.05% | VERIFIED live |
| MON / USD | `0xBcD78f76005B7515837af6b50c7C52BCf73822fb` | 8 | 1850663 ($0.0185066) | 09:44:20 | 21 s | 3600 s / 0.02% | VERIFIED live |
| BTC / USD | `0xc1d4C3331635184fA4C3c22fb92211B2Ac9E0546` | 8 | 7831779915709 ($78,317.80) | 09:43:06 | 95 s | 3600 s / 0.02% | VERIFIED live |
| USDC / USD | `0xf5F15f188AbCb0d165D1Edb7f37F7d6fA2fCebec` | 8 | 99980684 ($0.99981) | 09:26:18 | 1,103 s | 3600 s / 0.05% | VERIFIED live |

- Deviation is the RDD `threshold` field, which docs.chain.link shows as a percentage. Aave reads its own ETH source (section 1d), not the ETH/USD proxy above.

---

## Blocking unknowns (questions for the Monad / Aave teams)
1. **WMON is not an Aave V3 Monad reserve.** Is a WMON (or shMON/gMON) listing planned? Until then the Aave collateral options are WETH (LTV 80.5%) or cbBTC (73%, only 3.7 cbBTC supplied). For a non-Aave route, DefiLlama shows a Neverland "WMON" market of about $147k (REPORTED; addresses not verified).
2. **WETH → USDC exit liquidity.** Uniswap v3 WETH/USDC is about $4k deep and v4 pools are unchecked. Is there a recommended onchain WETH/USDC venue, or should the keeper rely on aggregator APIs (KyberSwap or 0x)?
3. **USDC vault liquidity.** The best two vaults are each instant-redeemable for only about $1–1.5M, and that changes every block. Are larger instantly-liquid USDC venues coming (for example the Morpho V2 vaults that have no liquidity adapter)?
4. **RPC for keeper and forks.** What are the wss connection and subscription limits on public endpoints? What history depth is guaranteed on rpc.monad.xyz for `anvil --fork-url`? Are higher hackathon rate limits available?
5. **Aave WETH price source** `0xce65…6902`. It shares an aggregator with Chainlink's listed SVR proxy `0x3805…7A78` but is not itself in Chainlink's directory. Can Aave or Chainlink confirm its heartbeat and deviation?
6. **Why WETH borrowing is disabled on Aave** while 1,540 WETH of debt exists (risk action?). This matters only if Open Bucket ever borrows WETH.
