# Monad Blitz Mumbai (Devcon Edition): Opportunity Research Report

*Generated 2026-11-04, which is hackathon day. This report draws on six parallel research tracks and about 300 tool calls. Overall confidence is medium-high for facts and medium for recommendations.*

**Labels used:** **[VF]** verified fact, with the source cited · **[ME]** market evidence · **[HYP]** hypothesis · **[AO]** analyst opinion · **[UNK]** unknown or unverified.

---

## READ THIS FIRST (if hacking starts soon)

1. **Logistics [VF]:**
   - **Submission:** fork https://github.com/monad-developers/monad-blitz-devcon-mumbai from the `main` branch, name the fork after your project with a one-line description, then follow the steps at https://blitz.devnads.com.
   - **Team size:** "Every hackathon submission must come from a team of two or three members." Solo entries look ineligible this time.
   - **Prize:** a $5,000 pool, with no split published (https://luma.com/Blitz-Mumbai-Devcon-2026).
2. **Judging [VF + AO]:** Today's judging method is **unpublished**. All earlier Mumbai Blitzes were **audience- or peer-voted**, and the June edition gave about **6 hours of build time**, with hacking at 12:00, code freeze at 18:00 and submissions due at 18:15. Plan for a crowd vote and roughly 6 hours. Confirm both at the venue.
3. **Do not build on:**
   - Monad Private Settlement: a white paper dated 2026-11-03, with no testnet, SDK or code.
   - Quantum Cadence: an arXiv paper only.
   - Native scheduled transactions: a proposal only.
4. **Recommended build:** **Open Bucket, cut down to its defensible core.** Each bucket is an isolated smart account that holds one cross-protocol obligation: collateral and debt on **Aave V3 (Monad)**, plus the borrowed stablecoin deployed into an **ERC-4626 vault**. On top of that sit two things.
   - **An onchain unwind guard.** Owner-set conditions are a deadline, a health-factor floor and an oracle-checked slippage limit. Once a condition holds, *anyone* can unwind, and the proceeds go only to the owner.
   - **A liability-aware read interface** with `assets()`, `liabilities()`, `equity()` and `health()`, so other contracts can value the position.

   Monad has **$782M of lending TVL and no DeFi Saver, Summer.fi or Instadapp equivalent [VF]**. Details are in Part I.
5. **Backups:**
   - **B1:** a borrow refinance router across Aave, Euler, Morpho and Curvance on Monad. It is a subset of the primary's code, so it is the fallback if the primary's scope slips.
   - **B2:** a hardened Uniswap v4 full-range LP share token ("Pair Tokens done right") on Monad.
6. **Honest odds:** In a peer vote, DeFi infrastructure usually loses to playful consumer demos. Past Mumbai winners were a P2P exchange, a time-capsule app and an AI betting app. You can only offset this with a sharp live demo on **real mainnet** in which the 300 ms blocks are visible.

---

## PART A — Executive Summary

**What opportunities exist [AO]:**
- The clearest *real* gap on Monad is **position management on top of lending**: automation, unwinds, refinancing and cross-protocol obligations.
  - Monad's chain TVL is about **$912M**. Lending takes **$788M** of it, concentrated in Aave V3 ($283M), Euler ($200M), Morpho ($166M) and Curvance ($132M) [VF, DefiLlama API, 2026-11-03].
  - None of DeFi Saver, Summer.fi or Instadapp is deployed. Gelato Web3 Functions are **testnet-only**, and FastLane Task Manager's mainnet status is [UNK] [VF, docs.monad.xyz AA providers page; Gelato supported-networks page].
- The second real gap is a **standards gap, not specific to Monad**. No ERC exists for a tokenized position that carries *liabilities*.
  - ERC-4626 has no `totalLiabilities()`. Integrators were explicitly warned in the EIP-4626 Magicians thread that leveraged vaults break the assumption `totalAssets == convertToAssets(totalSupply)` [VF: https://ethereum-magicians.org/t/eip-4626-yield-bearing-vault-standard/7900/100].
  - ERC-7621 (baskets) and ERC-7726 (quote oracle) don't cover it either [VF].
- The third gap is **ALM / LP share tokens for Uniswap v4 on Monad**. V4 did **$496M of 30-day volume on only $27M TVL**, and Gamma, Steer, ICHI and Arrakis are absent [VF, DefiLlama]. Novelty is low, though.

**What is changing in DeFi [VF + AO]:**
- Capital is moving into **curated and managed vaults** and **Pendle PTs**: Morpho $11.0B, Veda $1.74B, Pendle $1.02B. Index baskets are shrinking: Reserve fell from a $530M peak to **$47M** [VF, DefiLlama].
- Native delegation hooks are appearing in lending protocols:
  - Aave V4 Position Managers (live on Ethereum since 2026-03-30).
  - Euler EVC operators.
  - Curvance `leverageFor`/`deleverageFor` delegation.
  - Morpho pre-liquidation contracts.

  All of these are *protocol-specific*. Nothing ties them together across protocols [VF].
- Using vault-share exchange rates as collateral prices keeps getting exploited:
  - Hundred (2023)
  - Sonne (2024, ~$20M)
  - Resupply (2025, ~$9.5M)
  - Lazy Summer (2026-07, ~$6M)
  - sDOLA LlamaLend (2026-03)
  - Stream xUSD (2025-11, $93M loss, ~$285M of mapped curator exposure)

  [VF/ME, see Part D.]

**What Monad is emphasizing [VF + AO]:**
- "High-frequency finance": Perpl CLOB perps and Kuru CLOB.
- Institutional credit: Valos and Accountable.
- Privacy research: the PSD white paper and TACEO Merces private USDC (limited access on mainnet).
- Post-quantum consensus research.

Developer-facing, it is EVM compatibility with 300 ms blocks and 600 ms finality.

**Largest gaps [AO]:**
1. Lending position automation and unwinds.
2. Cross-protocol borrow refinancing.
3. Liability-aware position valuation.
4. V4 ALM.

**What to avoid [AO, evidence-backed]:**
- Another lending market: 13 exist and the native ones are shrinking.
- Another LST: 5 of them share $7.8M.
- Another DEX: 49 exist.
- An index/DTF product: no organic demand anywhere.
- Pendle clones: Pendle is #4 on Monad.
- Anything on PSD or Quantum Cadence.
- A "universal router": Enso and LI.FI already cover it.
- Adding AI for its own sake.

---

## PART B — Existing Ideas Audit

### A. Cross-protocol collateral interoperability

**Why protocols accept or reject collateral [VF]:** Listings are driven by custody model, redemption path and latency, bridge dependence, oracle availability and on-chain liquidity depth. Concrete examples:
- **WBTC:** BitGo moved to 2-of-3 custody with BiT Global (linked to Justin Sun) in August 2024. Sky voted to offboard WBTC (2024-09-19), then paused. LlamaRisk proposed WBTC LTV → 0 on Aave (https://cointelegraph.com/news/maker-sky-eyes-dropping-wrapped-bitcoin-justin-sun).
- **tBTC:** 51-of-100 threshold redemption, about 0.2% fee. Aave LTV 73% / liquidation threshold 78%.
- **LBTC:** 7-day Babylon unbonding plus about 2 days. Eligible only inside BTC-correlated E-Mode, at 84/86.
- **SolvBTC:** redemption is a non-transferable SFT with roughly 7 days of delay.

  Sources: Aave governance threads and the Threshold and Lombard docs listed in Sources.

**The distinctions you asked for [AO]:**

| Concept | What it means | Status |
|---|---|---|
| Token interoperability | Same ERC-20 interface | Solved (ERC-20) |
| Economic interoperability | Two tokens track the same underlying | Partly solved: Aave E-Mode, correlated-asset oracles |
| Collateral interoperability | Protocol X *accepts* token Y at some LTV | Governance decision. Not standardizable away, because it is a risk judgement |
| Position interoperability | Protocol X can *value and liquidate* a position held in protocol Z | **Unsolved.** No standard for liabilities or unwind paths |
| Cross-chain liquidity | Moving value between chains | Commodity: 30+ bridges on Monad [VF] |
| Cross-protocol composability | Atomic multi-protocol actions | Solved per tx (Morpho Bundler3, Enso, flash loans). Unsolved *over time* |

**Can one protocol safely recognize another's position?** Only if it can (a) price it with manipulation-resistant oracles and (b) liquidate it atomically. Async exits (ERC-7540), in-kind multi-token redemptions and opaque NAVs fail (b). That is why PTs are listed widely while DTFs and leveraged tokens are not [VF/AO].

**Double-counting:** This is avoided only by per-account isolation, as Gearbox credit accounts and Euler sub-accounts do, or by escrowing the receipt token. A "registry" of claims without custody does not prevent it [AO].

**Verdict: RED as framed.** "Make collateral portable" is a governance and risk problem, not a missing piece of code. The *useful kernel* is position interoperability, which feeds into B and F.
- **Score:** 3.95 / 10.
- **Strongest competitor:** Aave E-Mode plus Morpho's isolated markets, which already let curators list any representation.

### B. Open Bucket / persistent financial obligation

**Closest existing [VF]:**
- **Gearbox credit accounts** (live on Monad, only **$0.25M**). Isolated account; governance-allowlisted adapters; phantom tokens track pending async withdrawals as collateral; liquidators multicall to unwind.
  - **The limitation:** debt must come from Gearbox's own pools. You cannot borrow on Aave and deploy into Morpho.
- **DeFi Saver** strategies (ProxyAuth → StrategyExecutor; bot-supplied execution values; subscription hash stored onchain). Acts on the *lending position*, not on an outside yield venue. **Not on Monad.**
- **Brahma** sub-accounts plus the Executor Module.
- **Euler EVC** operators with deferred checks.
- **Curvance** `deleverageFor` delegation (on Monad).
- **Aave V4 Position Managers** (governance-gated; not on Monad, where Aave V3.7 runs).
- **Alchemix** self-repaying loans (single protocol).

**What is missing [AO; this absence came from searching, not proof]:**
- A persistent object that binds *debt on lender A* to *a position in unrelated venue B*, with:
  - enforced unwind conditions;
  - an oracle-checked slippage bound;
  - **permissionless execution once conditions hold**, so no trusted keeper is needed;
  - a standard read interface showing assets, liabilities and equity.
- Hackathon fragments exist: ETHGlobal "Cushion" and Chainlink "SentinelVault".

**Classification:**
- *Not* a new financial abstraction. It is a **credit account with external debt plus conditional settlement**.
- It *is* a meaningful improvement over the existing automation, and on Monad it fills a real ecosystem gap.
- A "protocol-neutral obligation registry" without custody would be an **unnecessary layer**. Custody (one isolated account per bucket) is what makes it safe.

**Verdict: GREEN, if narrowed (see Part I).**
- **Score:** 6.4 / 10.
- **Strongest competitor:** Gearbox, plus DeFi Saver if it ever deploys to Monad.

### C. Universal Collateral Router

**Existing [VF]:**
- Enso: zap-to-collateral, leverage, and zap-repay shortcuts. Support on Monad from day one.
- LI.FI Composer: swap or bridge into a vault token.
- DeFi Saver Loan Shifter.
- Morpho Bundler3.
- 7+ DEX aggregators on Monad.

**Missing [AO]:** A *discovery* layer that compares acceptance, LTV, liquidation threshold, caps and **liquidation-impact simulation** across Aave, Euler, Morpho, Curvance and Gearbox before routing. That is a front-end and data product, not a protocol.

**Verdict: RED as a protocol, YELLOW as a dashboard feature.**
- **Score:** 4.55.
- **Strongest competitor:** Enso.

### D. Exit Guardian

**Existing [VF]:**
- DeFi Saver: stop-loss, take-profit, trailing stop.
- Summer.fi: stop-loss and trailing stop.
- Morpho pre-liquidation.
- CoW ComposableCoW conditional orders.
- Curvance deleverage with `checkSlippage`.

The only gaps are **a min-repay constraint plus unwinds across protocols or with async exits**, and absence on Monad.

**Verdict: YELLOW standalone (a port).**
- **Score:** 5.6.
- **Fold it into B**, where it becomes the unwind guard.

### E. Collateral Passport

**Existing [VF]:**
- Credora by RedStone: probability-of-default ratings via API.
- Exponential A–F grades.
- LlamaRisk reports.
- Chaos Labs Edge risk oracle (pushes caps to Aave).
- Chainlink Proof of Reserve, NAV and SmartData feeds.
- **Draft ERC-8240 already defines an `IRWAPassport` interface**, so the name is taken.

**Missing [AO]:** An adopted open schema for *mechanics*: wrapper lineage, custodian or multisig, bridge type, redemption path and latency, and where the asset is accepted at what LTV. The Echo eBTC admin-key mint on Monad shows this matters: Curvance realized about $816K of bad debt in May 2026 [VF/UNK].

**Verdict: YELLOW long-term, RED for the hackathon.**
- Adoption, not code, is the bottleneck.
- A crowd vote won't reward a registry.
- **Score:** 4.7.

### F. Composable financial positions

**Existing [VF]:**
- ERC-4626: single asset, no liabilities.
- ERC-7540: async request → claim; previews revert.
- ERC-7575: multi-entry, one share token.
- ERC-7621 basket (Draft): weights informational, no liabilities.
- ERC-7726 quote oracle.
- Protocol-specific accounting: Euler EVC, Gearbox, Index Coop ETH2x (an ERC-20 wrapping an Aave CDP), Contango.

**Missing [VF absence after targeted search / AO]:** A **liability-aware position interface** that exposes:
- `assets[]` and `liabilities[]`;
- oracle-priced `equity`;
- health;
- a *permissionless atomic unwind path*.

That last property is what would make positions liquidatable, and so acceptable as collateral.

**Verdict: WILDCARD standalone, and the strongest *differentiator* when embedded in B.**
- **Score:** 5.6.
- **Strongest competitor:** none standardized. Gearbox and Euler accounting is bespoke.

---

## PART C — Pair Tokens Deep Dive (StonkBrokers × Hookr, Robinhood Chain)

**Evidence base [VF]:**
- Verified Solidity on Sourcify (chain 4663, solc 0.8.26, **BUSL-1.1**).
- The integration guide: https://stonkbrokers.io/integration/hooks/PairToken-Hookr-Integration.md
- Direct RPC reads against rpc.mainnet.chain.robinhood.com.
- The audit PDF.
- The cited GitHub repo (Clutch-L4bs/stonkbrokers) returns **404**.

**Status [VF]:**
- Live: `allPairsLength() = 72`.
- ETHNVDA (`0x0D142f…dCa8`) is an EIP-1167 clone holding about 1.364 ETH and 15.07 NVDA.
- Factory: `0x282c4815F30abc1D0A8eB810c7309140d35a5B38`.
- Robinhood Chain: an Arbitrum Orbit chain, public mainnet since 2026-07-01, with stock tokens and Morpho lending.
- Hookr's page still says "not deployed yet" (stale).

### Answers to your 20 questions (from code unless marked)

| # | Question | Finding |
|---|---|---|
| 1–2 | Contracts / GitHub | Sourcify-verified. GitHub repo 404. |
| 3 | v4 hook | **Factory pairs use *hookless* pools.** Only launcher "preset" pools use StonkFeeHook, which allowlists the vault as the sole LP. |
| 4–5 | Supply ↔ position | Each clone owns **one full-range position directly in PoolManager** (salt 0, own `unlockCallback`, no PositionManager NFT). Shares are a pro-rata claim on `basket()`, which is the position amounts at spot sqrtPrice plus idle balances. On hookless pools other LPs share the pool. |
| 6 | Mint | `deposit(a0,a1,minShares,to)`: shares = min(a0·S/r0, a1·S/r1). Genesis = sqrt(a0·a1), with 1000 dead shares. |
| 7 | Redeem | Pro-rata liquidity removal minus `RETENTION_BPS = 10` (0.1% stays with holders). Also `redeemZap`. |
| 8 | One-sided | `zapDeposit` swaps half through the *same pool with no price limit*. Guards: input ≤ 5% of reserve, tick move ≤ 200, `minShares`. |
| 9 | Compounding | `compound()` collects via `modifyLiquidity(0)`, ratio-swaps half the excess (cap 1.25% of reserve, **no price limit, no minOut**), then re-adds. It also runs before every deposit and redeem. |
| 10 | 10% fee | `protocolFeeBps = 1000` (owner can set up to 2000), carved from collected fees to the FeeManager via try/catch. |
| 11 | Buyback | `flush()` splits 50/50 to a booster contract and a "buyback" address. **That address is an EOA (`eth_getCode` = 0x), so there is no on-chain buyback logic.** Buybacks are discretionary and unverifiable. |
| 12 | Permissionless? | Yes. No caller reward. |
| 13 | Griefing | **No TWAP or oracle check anywhere.** An atomic self-sandwich of `compound()` is possible, bounded by uncollected fees and the 1.25% cap [INFERRED]. The team relies on Robinhood Chain's private sequencer, which does not stop atomic sandwiches. |
| 14 | Fungible? | Yes, one position per clone. |
| 15 | Collateral elsewhere? | No evidence [UNK]. Spot NAV makes it unsafe as a lending oracle without fair-reserve pricing [AO]. |
| 16 | Low liquidity / price shocks | Zap and redeem slippage are borne by users through min-outs. Stock tokens trade 24/7 while the underlying markets are closed, so gaps at market open are arbitraged against LPs [INFERRED]. |
| 17 | Depeg | Plain full-range AMM exposure. No protection. |
| 18 | IL | Yes, standard v2-style IL. |
| 19 | NAV | Spot `slot0`, which can be manipulated within a single transaction. |
| 20 | Hook inaccessible | Clones are immutable with no pause. **But on preset pools the launcher owner (an EOA) can call `setLpAllowed(vault,false)`. That makes the hook revert on add *and remove*, freezing redeem, deposit and compound** [VF code / consequence INFERRED]. The owner can't steal funds but can freeze them. |

**Trust caveats [VF]:**
- The owner of the factory and fee manager is an EOA.
- The "Hashlock Certified audit" was written by the project's own founder, so it is a self-review.
- `setRecipients` can redirect the fee carve anywhere.

**Novelty [VF prior art + AO]: low.**
- Pair Tokens are essentially **Uniswap v2 LP semantics rebuilt on v4**.
- Direct precedents:
  - Uniswap's own **v4 FullRange example hook**, which deploys a `UniswapV4ERC20` share per pool, is the sole LP and compounds lazily.
  - Bunni v2 (ERC-20 shares, LDFs, rehypothecation). Exploited for about $8.4M in September 2025 and shut down in October 2025, then relicensed MIT.
  - Arrakis v1 / G-UNI, Gamma, ICHI, Beefy CLM.
- **What is actually new is distribution:**
  - fused stock tickers (ETHNVDA);
  - tokenized equities;
  - first mover on Robinhood Chain;
  - built-in guarded zaps;
  - a single canonical token per pair.

**Monad opportunity [VF + AO]:**
- Uniswap v4 *is* live on Monad:
  - PoolManager `0x188d586ddcf52439676ca21a244753fa19f9ea8e`
  - PositionManager `0x5b7ec4a94ff9bedb700fb82ab09d5846972f4016`

  Both are verified via `eth_getCode` and the Uniswap deployments page.
- No ALM or LP-token project is found on Monad.
- **But Monad has no tokenized stocks**, which removes the actual hook of the concept.
- A *differentiated* Monad version would have to be **collateral-grade**:
  - fair-reserve NAV (sqrt(k) priced via Chainlink, not spot);
  - a deviation or TWAP guard on compound;
  - a keeper bounty;
  - an MIT base (FullRange or Bunni, not the BUSL code).

  That is a *hardened* LP token, not a new primitive.
- **Generalized strategy tokens:** possible, but that is just ERC-4626 strategies, which Yearn, Beefy and Veda already do.

**Verdict: YELLOW.**
- **Score:** 5.0.
- Good backup B2 because it is feasible and has an honest, testable security story.

---

## PART D — DTF and Strategy Token Research

**Reserve Protocol [VF, docs.reserve.org + Folio.sol in reserve-protocol/reserve-index-dtf]:**

*Yield DTFs (formerly RTokens)*
- Hold yield-bearing ERC-20s, including LP tokens.
- Staked RSR is first-loss capital, seized automatically on a collateral default.
- Emergency collateral is pre-set.
- Recollateralization runs through batch or Dutch auctions.

*Index DTFs ("Folios")*
- **In-kind** mint and redeem (pro-rata pulls of every basket token).
- **No on-chain NAV**: `totalAssets()` returns token amounts. Code comment: "may be unreliable mid-swap".
- Rebalancing:
  - a `REBALANCE_MANAGER` sets ranges;
  - an `AUCTION_LAUNCHER` opens Dutch auctions, which become permissionless after a window;
  - "trusted fillers" (CoW-style) are supported.
- Fees: TVL fee up to 10%/yr, mint fee up to 5%, DAO floor 10 bps.
- Governance: optimistic governance with vote-locked tokens.
- Token restrictions: no fee-on-transfer or rebasing tokens.
- Illiquid or dead constituent: `removeFromBasket` or sell it by auction. In-kind redeemers receive the illiquid token. No insurance on Index DTFs.

*Chains*
- Ethereum, Base and BSC (Index); Ethereum, Base and Arbitrum (Yield).
- **Not on Monad.**

**Adoption [VF/ME]:**
- TVL is **$46.9M** (2026-11-03), down from a **$529.7M peak** (2025-09).
- Reserve's own discover API lists 22 Index DTFs worth about $10M combined. Only LCAP ($4.56M) and CMC20 ($4.47M) are above $1M.
- A post attributed to the CEO (2026-01-06) says no DTF "has yet shown strong signs of truly organic product-market fit" and that revenue is negative. **It was found only on an unofficial mirror [UNK authenticity].**
- The TVL collapse after incentives were cut is consistent with that claim [ME].

**Your questions [VF code / AO]:**
- **Can a DTF hold DTFs?** Technically yes: `_addToBasket` rejects only the zero address and itself. None of the listed DTFs do.
- **LP positions?** Only as ERC-20s.
- **Lending positions?** Only as receipt tokens.
- **Debt?** Never.
- **Multi-protocol strategy?** Only as a static basket.
- **Used as collateral?** No Aave or Morpho listing found.
- **Automatic rebalancing?** Yes, via auctions.

**Comparison [VF]:**

| | Holds debt | Holds LP | Redemption | Collateral-listed |
|---|---|---|---|---|
| Reserve Index DTF | No | ERC-20 only | In-kind, sync | No |
| ERC-4626 / Yearn v3 | Hidden inside a strategy | Via a strategy | Sync | Widely (and the root of donation exploits) |
| ERC-7540 (Lagoon, Superform) | Yes, via manager | Yes | Async | Hard: no sync exit |
| Veda BoringVault | Yes | Yes | Rate set by Accountant, rate-limited | [UNK] |
| Enzyme | Yes (external positions) | Yes | Debt forfeited on in-kind redeem | [UNK] |
| Index Coop ETH2x | **Yes (an Aave CDP as ERC-20)** | — | App-based | No |
| Pendle PT | — | — | Fixed maturity | **Yes, heavily** (Aave V3/V4, Morpho) |
| Gearbox account | Yes | Yes | Owner closes | Not tokenized [UNK] |

**What a DTF offers that a vault doesn't:** a multi-asset basket with in-kind redemption and governed auction rebalancing. A vault is single-asset, with manager discretion. Neither has a liabilities model.

**Missing capabilities that look real [AO with VF support]:**
1. **A liability-aware equity-token standard**: `assets[]`, `liabilities[]`, `equity`, `health` and an unwind path. ETH2x, Gearbox, Contango and BoringVault loops each do this in their own way, and none is generically valuable to third parties.
2. **Donation-resistant, independently priced NAV** for composite tokens: track internal balances rather than `balanceOf`, and price each leg with oracles. There have been six or more donation and exchange-rate exploits from 2023 to 2026. Partial prior art exists: BGD's CAPO capped-price adapters on Aave, and Morpho Oracle V2.
3. **Collateral acceptance needs a liquidation path.** That is exactly why PTs get listed and baskets don't.
4. **An open slot on Monad**: no DTFs, no basket standard. But **Reserve's experience is strong evidence against demand.**

**Verdict:**
- **DTF/index on Monad: RED** (score 3.8).
- **Equity-token interface: WILDCARD**, best embedded in the primary build.

---

## PART E — Monad Technical Research

**Networks [VF, docs.monad.xyz]:**
- **Mainnet:** chain **143**, MON, revision MONAD_TEN.
  - Launched 2025-11-24 (press).
  - The docs disagree on the client version (v0.16.4 vs v0.16.1).
  - RPC: `https://rpc.monad.xyz`, `rpc1`/`rpc2`/`rpc3.monad.xyz`, and `https://rpc-mainnet.monadinfra.com` (which serves historical data).
- **Testnet:** chain **10143**, **reset from genesis 2025-12-16**.
  - RPC: `https://testnet-rpc.monad.xyz` (50 rps, eth_call limited to 25 rps, archive).
  - Faucet: https://faucet.monad.xyz.
- **Explorers:** MonadVision (monadvision.com), Monadscan (monadscan.com), Tenderly, Phalcon, JiffyScan for UserOps.

**Performance [VF, docs summary page]:**

| Property | Value |
|---|---|
| Block time | **300 ms** |
| Speculative finality | at +1 block (rare reverts possible) |
| Hard finality | **600 ms** (+2 blocks) |
| State-root verification | at +5 blocks |
| `TIMESTAMP` granularity | 1 s, so 3–4 blocks share a timestamp |
| Block gas limit | 150M |
| Per-transaction gas limit | 30M |
| Throughput | ~500M gas/s |
| Minimum base fee | 100 MON-gwei |

The timestamp granularity matters for deadline logic.

**Architecture [VF]:**
- **MonadBFT:** HotStuff-family, pipelined, BLS-aggregated quorum certificates, tail-fork resistant, RaptorCast block propagation.
- **Asynchronous execution:** consensus orders transactions first; the state root lags by k=3 blocks.
- **Optimistic parallel execution:** results are identical to serial execution and no contract changes are needed. JIT compilation is also used.
- **MonadDB:** not researched in depth [UNK details].
- **No global mempool:** RPCs forward to upcoming leaders. `newPendingTransactions` is unsupported; use `monadNewHeads` and `monadLogs` instead.

**Differences that will bite you today [VF, docs.monad.xyz/developer-essentials/differences]:**
- **Gas is charged on the gas *limit*, not gas used.** Set tight limits in keepers and in the frontend.
- **Storage pricing (MONAD_TEN, MIP-8):**
  - cold account access: 10,100 gas;
  - cold storage: **8,100 per 128-slot page**;
  - SSTORE: 2,800 for the first write in a page, plus 17,000 per net-new slot.

  Packed, adjacent storage is cheap; scattered mappings cost more.
- **Contract size limit:** 128 KB, initcode 256 KB.
- **Transaction types:** 0, 1, 2 and **4 (EIP-7702)** are supported. Type 3 (blob) is not.
- **Extra precompiles:**
  - P256VERIFY at `0x0100` (passkeys);
  - staking at `0x1000`;
  - reserve balance at `0x1001`.
- **Reserve balance:**
  - Every EOA has a 10 MON reserve.
  - **An EOA delegated via 7702 can never go below 10 MON, and cannot CREATE or CREATE2 when called as a contract.**
  - A transaction can be included and still revert for insufficient balance, and it still pays gas.
- **Foundry:**
  - **Version ≥ 1.8.0** with `network = "monad"` in foundry.toml, or `--network monad`. Otherwise tests run with Ethereum gas rules.
  - Local node: `anvil --network monad`.
  - `forge create` needs `--broadcast`.
  - Verify on Sourcify: `--verifier sourcify --verifier-url https://sourcify-api-monad.blockvision.org/`.
  - viem ≥ 2.40.0.

**Canonical mainnet addresses [VF, docs network-information page + monad-crypto/protocols repo]:**

| Contract | Address |
|---|---|
| WMON | `0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A` |
| Multicall3 | `0xcA11bde05977b3631167028862bE2a173976CA11` |
| Permit2 | `0x000000000022d473030f116ddee9f6b43ac78ba3` |
| CreateX | `0xba5Ed099633D3B313e4D5F7bdc1305d3c28ba5Ed` |
| EntryPoint v0.7 | `0x0000000071727De22E5E9d8BAf0edAc6f37da032` |
| EntryPoint v0.8 | `0x4337084d9e255fF0702461CF8895cE9E3b5Ff108` |
| Simple7702Account | `0xe6Cae83BdE06E4c305530e199D7217f42808555B` |
| Uniswap v4 PoolManager | `0x188d586ddcf52439676ca21a244753fa19f9ea8e` |
| Uniswap v4 PositionManager | `0x5b7ec4a94ff9bedb700fb82ab09d5846972f4016` |
| Uniswap v4 StateView | `0x77395f3b2e73ae90843717371294fa97cc419d64` |
| Chainlink MON/USD | `0xBcD78f76005B7515837af6b50c7C52BCf73822fb` |
| Chainlink ETH/USD | `0x1B1414782B859871781bA3E4B0979b9ca57A0A04` |
| Chainlink BTC/USD | `0xc1d4C3331635184fA4C3c22fb92211B2Ac9E0546` |
| Chainlink USDC/USD | `0xf5F15f188AbCb0d165D1Edb7f37F7d6fA2fCebec` |
| Pyth | `0x2880aB155794e7179c9eE2e38200202908C17B43` |

- **Aave V3 Monad, Morpho and Euler addresses were *not* collected.** Get them from bgd-labs/aave-address-book (`AaveV3Monad`) and the protocols' own docs. Do not trust any address you didn't read from a primary source.

**Developer tooling [VF]:**
- **AA:** Alchemy, Biconomy, Pimlico, Sequence, thirdweb and ZeroDev are on mainnet. Gelato and Openfort are testnet-only.
- **Embedded wallets:** Privy, Dynamic, Para, Turnkey and others, all on mainnet.
- **Indexers:** Envio, Goldsky, The Graph, SubQuery, SQD.
- **Native scheduled transactions:** a **proposal only** (Category, 2026-10-22).

**Monad Private Settlement Domains [VF, https://category.xyz/mpsd-whitepaper; PDF not opened separately]:**
- Dated **2026-11-03**.
- Architecture:
  - A permissioned execution domain run by chosen operators.
  - A hub contract on Monad plus a spoke per domain. **No protocol change.**
  - Users send encrypted domain transactions wrapped in public "courier" transactions.
  - Operators derive domain blocks deterministically from Monad blocks (FIFO, lock-step), execute them, and post state and message Merkle roots with attestations.
  - Cross-domain messages are proven against anchors on Monad.
  - Access control works through RPC read restrictions plus per-contract "policy enforcer" contracts.
  - Tokens move by lock-and-mint.
- **Trust (v1):**
  - Multisig threshold attestation only.
  - **Every operator sees the full state, so a single rogue operator breaks privacy.**
  - zkVM and TEE attestation are future work.
  - If all operators disappear, funds may be unrecoverable.
- **Leaks:** courier metadata, amounts crossing the boundary, and reader identities.
- **Status: research paper. No testnet, SDK, repo or docs.** The paper mentions a TACEO MPC integration.
- **What you *can* use:** TACEO Merces private USDC (limited access on mainnet, `@taceo/merces-client`) and a testnet demo (`@taceo/merces-oft-client`) [VF, docs.monad.xyz/tooling-and-infra/privacy].
- **Verdict: do not build on PSD.**

**Quantum Cadence [VF, arXiv 2610.32803, submitted 2026-10-23]:**
- "Post-Quantum Consensus with Multiple Concurrent Proposers".
- No quorum certificates. Safety and liveness don't rely on signatures, which are used only for accountability.
- Quantum Chorus fast path, with Coda (a signature-free Byzantine agreement protocol) as fallback.
- Builds on **Cadence** (arXiv 2607.02275): a multi-proposer successor design with about 219 ms simulated finality.
- Neither paper mentions MonadBFT. Mainnet still runs MonadBFT with BLS.
- The post-quantum roadmap (monad.xyz/blog/post-quantum-roadmap, 2026-09-28) gives no dates.
- **Status: research only, plus a prototype on an internal test network. Nothing a developer can use.**

---

## PART F — Monad Ecosystem Research

**Top protocols by Monad TVL, 2026-11-03 [VF, api.llama.fi]:**

| # | Protocol | Category | TVL | Notes |
|---|---|---|---|---|
| 1 | Aave V3 (v3.7) | Lending | $283.3M | Live 2026-07-02. 12 assets: USDC, USDT0, GHO, USDe, AUSD, WETH, **cbBTC**, wstETH, weETH, sUSDe, … Chainlink SVR. About $15M of foundation incentives |
| 2 | Euler V2 | Lending | $200.5M | EVC operators, sub-accounts; curated by K3 and Hyperithm |
| 3 | Morpho Blue | Lending | $166.1M | Pre-liquidation and Bundler3 available on the protocol (Monad deployment of these [UNK]) |
| 4 | Pendle V2 | Yield tokenization | $145.9M | PT/YT on AUSD, earnAUSD, srUSDat |
| 5 | Curvance | Lending | $132.5M | **Delegable actions plugin (`leverageFor`/`deleverageFor`)**. Echo eBTC bad debt (May 2026) |
| 6 | Valos | RWA credit | $106.1M | Via Accountable |
| 7 | Reservoir | CDP | $65.9M | |
| 8 | Veda | Vaults | $44.6M | Double-counted |
| 9 | Uniswap V4 | DEX | $27.2M | **$496M of 30-day volume** |
| 10 | Upshift (earnAUSD) | Vault | $20.0M | **Withdrawals queued up to 72h** |
| — | Neverland | Lending (Aave V3 fork + veDUST) | $5.3M | Self-Repay via veDUST rewards; one-tx PT loops; maturity gateway **does not repay debt**; down from >$15M |
| — | TownSquare | Lending / loop vaults | $0.15M | Shrinking about 40% over 30 days |
| — | Covenant | Senior/junior split of vault tokens | $0.04M | Tiny |
| — | Gearbox | Credit accounts | $0.25M | The closest competitor to the primary build |
| — | Glider | Portfolio automation | — | **No evidence it is on Monad** (Base, Plume, Solana) |

**Ecosystem facts [VF]:**
- Stablecoins total $581M: USDC $203M (native, with CCTP), USDe $125M, AUSD $78M, USDT0 $42M.
- BTC on Monad: cbBTC (via CCIP), WBTC (via LayerZero OFT), LBTC and BTC.b (via CCIP).
- 30-day fees across the chain: **$6.0M against $912M of TVL**.
- Large incentive dependence: about $144M of AUSD was farmed TVL, and Morpho's yields are mostly MON incentives [ME, Blockworks].
- TVL is **down from a $1.04B peak in October** [VF].

**Hackathon winners and patterns [VF from the blitz.devnads.com showcase API: 95 winner records, 1,841 projects across 68 events]:**

*Mumbai v1 winners*
1. Cryptobazaar: P2P USDC trading.
2. Teejor: on-chain time capsules.
3. RageBetAnds: betting against a trash-talking AI.

*Mumbai V2–V4*
- Have submissions, but no winners are flagged in the API [UNK].

*Other Indian Blitzes*
- AgMON: AI DeFi portfolio automation (Delhi).
- MON Go (Bangalore).
- Monarch (Pune).
- MonadStudio IDE (Bhopal).
- Universal Arc Kit: cross-chain intents (Nagpur).

*Global winners that are native to Monad*
- T-MON: high-TPS ticketing (Seoul #1).
- Flow: per-second streaming payments (Lagos).
- Blockbeat: audience-played on-chain sequencer (Berlin).
- Vertex and HotSlot: parallel-execution conflict tooling.
- Kapalı Zarf: sealed-bid liquidation auction (Ankara #1).
- WICK: LVR-aware market maker (Ankara).

*Other competitions*
- **Metropolis** (Sep–Oct 2026, $250k+, four tracks): winners were due Nov 3 and not found [UNK].
- **Monad Madness Bangkok:** RareBetSports, Kizzy, Sparkball. No criteria were published.

**Documented vs interpreted:**
- **Documented [VF]:** crowd or peer voting; no written rubric for any Blitz.
- **Interpreted [AO]:**
  1. The live demo *is* the product.
  2. Audience participation and "whoa" moments win.
  3. Projects whose demo *only works* because of fast blocks stand out.
  4. Removing friction (no wallet popups) is a recurring theme.
  5. Recent Mumbai entries are crowded with AI-agent and DeFi projects. About two-thirds of V3/V4 entries.
  6. **One DeFi automation project (AgMON, Delhi) won, so a DeFi project is not disqualified by crowd voting.**

**Potential partner protocols [AO]:**
- **Aave V3 Monad:** the biggest debt base.
- **Curvance:** native delegation hooks, and the protocol hurt by the Echo incident.
- **Euler:** EVC operators.
- **Morpho:** vaults as the venue to deploy into.
- **Gearbox:** could integrate rather than compete.
- **Enso / Kuru Flow / 0x:** swap routing.
- **FastLane:** Task Manager as the future keeper.

---

## PART G — New Opportunity Discovery (with existing-solution audit)

| # | Opportunity | Existing solutions | Gap left | Class |
|---|---|---|---|---|
| 1 | **Cross-protocol obligation account** (Open Bucket, narrowed): isolated account holding A-debt and B-position, permissionless conditional unwind, liability-aware lens | Gearbox (own debt only), DeFi Saver (lending side only, not on Monad), Brahma, Curvance delegation | External debt plus external venue as one object, trust-minimized trigger, standard valuation. Absent on Monad | **GREEN** |
| 2 | **Borrow refinance router on Monad**: move a borrow between Aave, Euler, Morpho, Curvance and Neverland in one transaction via flash loan | DeFi Saver Loan Shifter (not on Monad), Morpho migration adapters (Aave/Compound → Morpho only) | Monad has incentive-driven rate swings and nothing that moves *borrows* [VF absence] | **YELLOW** (a port, but useful) |
| 3 | **PT-maturity obligation manager**: auto-roll or auto-close PT-collateralized loans at maturity | Pendle's app roll (spot PT only), Neverland maturity gateway (migrate/repay but **does not repay debt**), Contango PT loops (Ethereum) | Aave Monad onboarded PT-USDe-22OCT2026 [VF governance URL]. Expired-PT loops need active handling. Size of affected positions [UNK] | **YELLOW** (needs data) |
| 4 | **Deleverage / liquidation guard for the top four lenders** | DeFi Saver, Summer.fi elsewhere; Morpho pre-liquidation; Curvance `deleverageFor` | Absent on Monad as a product | YELLOW (a port). Merged into #1 |
| 5 | **Liability-aware position interface (equity-token ERC draft) plus reference adapters** | ERC-4626/7540/7575/7621/7726: none model liabilities | A real standards gap [VF] | **WILDCARD**. Embedded in #1 |
| 6 | **Collateral-grade v4 full-range share token** (fair-reserve NAV, deviation-guarded compound, keeper bounty) | Uniswap FullRange example, Bunni v2 (dead), Arrakis, Gamma, ICHI, Beefy CLM, StonkBrokers Pair Tokens | No ALM on Monad, $496M/30d v4 volume. Low novelty | **YELLOW** |
| 7 | **Async-exit-aware collateral adapter** (phantom-token style for ERC-7540 / queued vaults such as earnAUSD's 72h queue) | Gearbox phantom tokens (Gearbox only) | No generic adapter for Monad lenders. Needs lender governance to list it | WILDCARD (not hackathon-feasible) |
| 8 | **Donation-resistant vault-share oracle** | BGD CAPO capped adapters, Morpho Oracle V2, Chainlink exchange-rate feeds | Mostly solved | RED |
| 9 | **Wrapper-lineage / collateral mechanics registry** (Passport) | Credora, Exponential, LlamaRisk, Chaos Edge, draft ERC-8240 | Open mechanics schema. The bottleneck is adoption | YELLOW long-term / RED hackathon |
| 10 | **Universal collateral router** | Enso, LI.FI Composer, Bundler3 | Discovery UI only | RED |
| 11 | **Index DTF on Monad** | Reserve, Index Coop, Enzyme | No demand evidence (Reserve fell from $530M to $47M) | RED |
| 12 | **Private OTC / confidential lending on PSD** | — | No tooling exists. Merces private USDC is limited access | RED now / WILDCARD 2027 |
| 13 | **Sealed-bid liquidation auctions** | Kapalı Zarf (won Ankara Blitz), Euler/Morpho liquidation designs | Already a winning Blitz project | RED (novelty) |
| 14 | **Keeper / scheduled-transaction network** | FastLane Task Manager, Category's proposal | Incumbent present | RED |
| 15 | **Senior/junior tranching of vault tokens** | Covenant, Mu Digital, Saturn srUSDat, Accountable | Crowded for a tiny base | RED |

---

## PART H — Opportunity Ranking (weighted framework)

Weights: problem 15%, demand 15%, novelty 15%, differentiation 15%, Monad 10%, feasibility 10%, security 10%, business 10%.

| Rank | Opportunity | Prob | Dem | Nov | Diff | Monad | Feas | Sec | Biz | **Score** |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Obligation account (Open Bucket, narrowed) | 7 | 6 | 6 | 7 | 7 | 6 | 6 | 6 | **6.40** |
| 2 | Borrow refinance router | 6 | 6 | 3 | 5 | 7 | 7 | 7 | 6 | **5.70** |
| 3 | PT-maturity obligation manager | 6 | 5 | 5 | 6 | 7 | 6 | 6 | 5 | **5.70** |
| 4 | Liability-aware position interface (standalone) | 6 | 4 | 7 | 7 | 4 | 7 | 6 | 3 | **5.60** |
| 5 | Collateral-grade v4 LP share token | 5 | 5 | 3 | 5 | 6 | 7 | 5 | 5 | **5.00** |

None of these scores is high. That is the honest result: the best options are **well-executed improvements in an under-served ecosystem**, not breakthrough primitives.

**#1 Obligation account**
- **Why it matters:** $782M of Monad lending TVL with zero management tooling. Borrow-and-deploy carry is the dominant incentive-farming pattern (AUSD, Morpho incentives).
- **Why now:** Aave V3 has been on Monad since July 2026, Euler and Curvance are large, and no incumbent has arrived.
- **Why Monad:** see the ecosystem gap. 300 ms blocks give a tight trigger-to-execution latency. Gas is cheap enough for one account contract per user.
- **Honest counterpoint:** the design would work equally well on Base.
- **Competition:** Gearbox (Monad), DeFi Saver (if it deploys).
- **Main risk:** demand [HYP]. Nobody has measured how many Monad addresses actually run a borrow-and-deploy carry. In addition, Aave V4 Position Managers on Monad would erode the gap.
- **MVP:** feasible in 6 hours with a tight scope (Part I).

**#2 Refinance router**
- **Why it matters:** rates on Monad are incentive-driven and shift often.
- **Main risk:** zero novelty. DeFi Saver could deploy it as soon as Monad is commercially attractive.
- **Feasibility:** Aave↔Morpho with a flash loan is about 4 hours.

**#3 PT maturity manager**
- **Why it matters:** obligations with *hard deadlines*. This is exactly the "deadline" field of the Open Bucket.
- **Main risk:** an unknown number of affected positions. The Pendle router integration is complex for one day.

**#4 Position interface**
- **Why it matters:** fills a documented gap in the standards.
- **Main risk:** a standard without adopters is architecture theatre. That is why it is embedded in #1 rather than built alone.

**#5 v4 LP share token**
- **Why it matters:** v4 volume vs TVL on Monad.
- **Main risk:** low novelty, and the security of a v4 vault is subtle. Bunni died to an exploit.

---

## PART I — Hackathon Recommendation

### Primary: **Open Bucket** (cross-protocol obligation account)

**Product definition.**
- A factory deploys one **isolated Bucket contract per obligation**, owned by the user.
- In one transaction the Bucket:
  1. supplies collateral (WETH or cbBTC) to **Aave V3 Monad**;
  2. borrows USDC;
  3. deposits the USDC into a chosen **ERC-4626 USDC vault** (a Morpho or Euler vault on Monad).
- The owner sets a **Guard**:
  - `deadline`: obligation maturity;
  - `minHealthWad`: health-factor floor;
  - `maxSlippageBps`: slippage limit versus Chainlink;
  - `bountyBps`: caller reward.
- **When any condition holds, anyone can call `unwind()`**:
  1. redeem the vault shares;
  2. repay Aave;
  3. cover any shortfall by swapping collateral, with the minimum output enforced on-chain against Chainlink;
  4. withdraw the collateral;
  5. send everything to the owner, and pay the caller a capped bounty.
- The Bucket implements a **liability-aware lens**, so wallets, dashboards and other protocols can read assets, liabilities and oracle-priced equity.

**Target user:** Monad borrowers running carry or farming loops, about 12+ lending venues' worth of users.
- *Secondary:* curators and allocators managing positions for clients.
- *Long-term:* protocols that want to accept such positions as collateral.

**Core problem:** a borrow-and-deploy position spans two protocols that know nothing about each other. Nobody is watching the obligation as a whole, the unwind takes several transactions, and on Monad no automation exists.

**Unique value proposition [AO]:**
1. **External debt plus external venue as one isolated object.** Gearbox can't do this, because its debt comes from its own pools.
2. **Trust-minimized execution.** Conditions are checked on-chain, so the executor needs no permissions. Proceeds can only go to the owner. That is a better trust model than an allowlisted bot (as in DeFi Saver or Brahma).
3. **Position-level valuation interface**, which no ERC currently provides.
4. **First on Monad.**

#### Contract design (Solidity 0.8.26+, Foundry ≥ 1.8 with `--network monad`)

```solidity
interface IPositionLens {
    /// tokens held (aTokens counted as underlying, vault shares as previewRedeem)
    function assets() external view returns (address[] memory tokens, uint256[] memory amounts);
    function liabilities() external view returns (address[] memory tokens, uint256[] memory amounts);
    /// oracle-priced (Chainlink), never spot/pool-derived; quote = USD 8-dec
    function equityUsd() external view returns (int256);
    function healthFactor() external view returns (uint256 wad);
}

struct Guard {
    uint64  deadline;        // 0 = none; NOTE Monad TIMESTAMP is 1s granularity
    uint64  minHealthWad;    // 0 = none; e.g. 1.15e18
    uint16  maxSlippageBps;  // swap minOut = oraclePrice * (1 - bps)
    uint16  bountyBps;       // capped, e.g. <= 50 (0.5%) of returned equity, absolute cap too
}

contract Bucket is IPositionLens, ReentrancyGuard {
    address public owner;                    // set once in initialize (EIP-1167 clone)
    IPool   public aave; IERC20 public collateral; IERC20 public debt; IERC4626 public venue;
    Guard   public guard;
    mapping(address => bool) public swapTargets; // allowlisted routers (factory-set)

    function open(uint256 collAmt, uint256 borrowAmt) external onlyOwner;   // supply→borrow→deposit
    function setGuard(Guard calldata g) external onlyOwner;
    function canUnwind() public view returns (bool ok, uint8 reason);       // 1=deadline 2=health
    function unwind(address swapTarget, bytes calldata swapData) external nonReentrant;
        // owner: anytime. others: require(canUnwind). swapData supplied by caller,
        // contract enforces minOut from Chainlink + maxSlippageBps → caller can't steal via bad route
    function rescue(address token) external onlyOwner;                      // after close only
    event Opened(uint256 coll, uint256 borrowed, uint256 shares);
    event Unwound(address caller, uint8 reason, uint256 repaid, uint256 returned, uint256 bounty);
}

contract BucketFactory { function create(...) external returns (Bucket); } // OZ Clones
```

**Unwind transaction lifecycle:**
1. Check `canUnwind()`, or that the caller is the owner.
2. `venue.redeem(balanceOf(this), this, this)`, which returns USDC.
3. `aave.repay(USDC, min(usdc, debt), 2, this)`.
4. If debt remains:
   - withdraw the collateral that can safely be released;
   - `swapTarget.call(swapData)`;
   - **require** that USDC received ≥ `collSold × chainlinkPrice × (1 − slippage)`;
   - repay.

   Loop at most N times. *Strong version:* use an Aave `flashLoanSimple` for a single-step close.
5. `aave.withdraw(collateral, max, this)`.
6. Transfer the bounty to `msg.sender`, and everything else to the owner. Emit `Unwound`.

**Security boundaries:**

| Threat | Mitigation |
|---|---|
| Reentrancy | `nonReentrant`; external calls only to fixed protocol addresses and allowlisted swap targets |
| Oracle / sandwich | Swap minOut derived from Chainlink, not from pool spot. The trigger uses Aave's own health factor (Aave oracle) |
| Malicious executor | Can only trigger when on-chain conditions hold. Proceeds are hard-coded to the owner. Bounty capped in both bps and absolute terms. A bad route reverts on the minOut check |
| Malicious `swapData` | Target is allowlisted. Contract checks before/after balances. Approval resets to 0 after the call |
| ERC-4626 donation / inflation | Shares are only redeemed, never priced as collateral. `equityUsd()` is labelled informational. Strong version: price the vault leg conservatively |
| Double-counting | One Aave account per Bucket (isolation). No shared collateral |
| Griefing (unwinding early) | Impossible: triggers are owner-defined, and the owner can update or clear them |
| Keeper failure | Permissionless, so anyone, including the owner via the UI, can execute |
| Venue illiquid (queue / `maxRedeem < shares`) | Revert with a reason. Long-term: ERC-7540 request/claim state machine |
| Monad gotchas | Gas is charged on the *limit*, so the keeper must use tight estimates. Deadlines have 1 s timestamp granularity. Don't use 7702 delegation for the Bucket (the 10 MON reserve and no-CREATE rules) |

**Never claim:** that it is audited, production-safe, or that it handles async venues in the MVP.

#### Integrations

All of these must be verified from primary sources during the first 30 minutes.

1. **Aave V3 Monad Pool and the USDC reserve.** Get the addresses from `bgd-labs/aave-address-book` (`AaveV3Monad`). Check:
   - USDC is borrowable, and the caps;
   - WETH or cbBTC supply caps;
   - whether flash loans are enabled.
2. **A USDC ERC-4626 vault on Monad with synchronous redemption** (a Morpho MetaMorpho or Euler EVault). Check `maxRedeem` and liquidity.
3. **Chainlink ETH/USD and USDC/USD** (addresses in Part E).
4. **A swap route:** Kuru Flow, KyberSwap or 0x API calldata for Monad. Pick one with a working API key.

| Feature | Status in the MVP |
|---|---|
| Aave, the vault and Chainlink | **Real mainnet integrations** |
| Health-factor trigger on stage | **Simulated on an `anvil --network monad --fork-url` mainnet fork** (oracle source swapped by impersonating the Aave admin). **Label it as a fork on stage** |
| Async exits (ERC-7540) | **Planned** |
| Euler, Curvance and Morpho-as-lender adapters | **Planned** |

#### MVP scopes

- **Minimum viable demo (about 6 hours):**
  - Factory, Bucket and lens for Aave plus one 4626 vault.
  - Deadline and health-factor triggers.
  - Unwind with a no-shortfall path, plus one shortfall swap iteration.
  - A viem keeper script on `monadNewHeads` / `watchBlocks` that polls `canUnwind()` and calls `unwind`.
  - A Next.js dashboard.
  - Fork tests.
  - **Real mainnet open → deadline-triggered automatic unwind** with about $10–20 of capital.
- **Strong submission:**
  - Flash-loan single-step close.
  - A second lender adapter (Euler or Curvance).
  - Bucket ownership as an ERC-721, so the obligation is transferable.
  - Bounty race shown live.
  - Envio indexer for history.
- **Long-term product:**
  - Adapters for all four lenders and ERC-7540 venues (request → claimable → claim → repay).
  - An ERC draft for the lens.
  - Integration with FastLane Task Manager.
  - Audits.
  - Curator and allocator dashboards.
  - Positions acceptable as collateral (needs a lender to list them).

#### Development schedule

Assumes 12:00–18:00 and three people: **C** writes contracts, **F** builds the frontend, **K** handles keeper, demo and docs.

| Time | C | F | K |
|---|---|---|---|
| 12:00–12:30 | Verify Aave, vault and router addresses; foundry.toml with `network="monad"` | Scaffold Next.js + wagmi/viem (chain 143) | Fork the repo, register on the portal, fund the wallet, get the swap API key |
| 12:30–15:00 | Bucket + Factory + lens; fork tests (open / unwind / trigger / malicious swap reverts) | Dashboard: lens view (collateral, debt, shares, HF, equity), Open form, Guard form | Keeper script; fork setup with an oracle-crash script |
| 15:00–16:00 | Deploy and verify on mainnet (Sourcify); tiny real open | Wire to deployed contracts; live block ticker; MonadVision tx links | Dry-run the whole demo on the fork |
| 16:00–17:15 | Shortfall swap path, or a second trigger, *only if green* | Polish: unwind timeline and events feed | README: what is real vs forked vs planned; architecture diagram |
| 17:15–18:00 | **Freeze features.** Bug fixes only | Record a backup video | Rehearse the pitch twice; submit by 18:00, before the 18:15 deadline |

**About 5–6 hours of total effort:**
- contracts about 3.5 h;
- frontend about 4 h;
- integration about 1.5 h;
- testing about 1.5 h;
- demo prep about 1 h.

**Cut lines:** if behind at 15:00, drop the shortfall swap path (debt is fully covered by vault proceeds in the demo). If behind at 16:00, drop the health-factor trigger and demo only the deadline trigger.

#### Demo script (3 minutes)

1. **20 s:** "I borrowed USDC on Aave and parked it in a Morpho vault. That's one financial obligation split across two protocols, and nobody is watching it. Monad has $782M in lending and zero position automation."
2. **40 s, live on mainnet:** Open a bucket in one transaction. The dashboard shows Aave debt, vault shares, health factor and equity, all read through the lens interface. Show the MonadVision link.
3. **40 s:** Set the deadline to now + 45 s. Explain the trust model: "This keeper has *no* permissions. Anyone can execute once the deadline passes, and the money can only go back to me."
4. **30 s:** The deadline passes, the keeper fires within about one block, and the dashboard flips to *Closed*: debt repaid, collateral and profit returned. Show the tx link.
5. **30 s, on the fork (labelled):** Crash ETH, the health factor drops below 1.15, and the unwind fires before liquidation. Show the slippage guard rejecting a malicious route.
6. **20 s:** "Next: Euler and Curvance adapters, async vault exits, and the lens as an ERC."

*Optional crowd hook:* put up a QR page where audience members race to call `unwind()` the moment the deadline passes, for the bounty. 300 ms blocks make the race visible. Do it only if a rehearsal goes cleanly.

**Judging advantages [AO]:**
- Real mainnet integrations with the chain's largest protocols.
- A clear gap in the ecosystem.
- A crisp trust-model story.
- Monad speed visible on screen.

**Disadvantages:**
- DeFi infrastructure in a crowd vote.
- "Isn't this DeFi Saver?" Answer: not on Monad; external venue; permissionless trigger; position lens.

### Backup 1: Borrow refinance router (Aave ↔ Morpho / Euler on Monad)

- Flash loan from Aave: repay debt on A → withdraw collateral → supply to B → borrow on B → repay the flash loan. One transaction.
- Reuses the primary's adapters, so it is the natural fallback if the vault and trigger parts slip.
- **Score 5.7. YELLOW:** a useful port with low novelty.
- **Competitor:** DeFi Saver Loan Shifter (not on Monad).

### Backup 2: Collateral-grade Uniswap v4 full-range share token on Monad

- Build from the MIT-licensed Bunni v2 code or the Uniswap FullRange example. **Do not use the StonkBrokers BUSL code.**
- Add:
  - fair-reserve NAV, using sqrt(k) with Chainlink prices;
  - `compound()` with a Chainlink deviation guard and a keeper bounty;
  - guarded zaps.
- Pairs: MON/USDC or WETH/USDC on PoolManager `0x188d…`.
- **Score 5.0. YELLOW.** The honest pitch is "a hardened Pair Token", not "a new primitive".

---

## PART J — Startup Potential

**Obligation account / position management on Monad (the strongest candidate):**

- **Market:**
  - Monad borrowers ($782M of lending TVL; user counts [UNK]).
  - Curators and allocators (19 curators, $466M).
  - Later, any EVM chain without DeFi Saver.
- **Business model [VF comparables]:**
  - Execution fee of about 0.1–0.25% per automated action (DeFi Saver charged 0.25% per adjustment; Summer.fi about 0.2%).
  - Possibly a bounty spread.
  - B2B white-label for lenders that want automation built into their own UI (Curvance, Neverland).
- **Distribution:**
  - Partner with one lender (Curvance or Neverland have native incentives to add retention features).
  - Monad Foundation grants and Nitro (up to $500k per team [VF press]).
- **Defensibility: weak to moderate.**
  - Automation is copyable.
  - The moats are integrations breadth, being the default UI on Monad, and the lens standard *if* lenders adopt it.
- **Why it could fail:**
  1. Demand for borrow-and-deploy carry is incentive-driven and shrinking (TVL is down from $1.04B, and fees are low relative to TVL).
  2. DeFi Saver deploys to Monad.
  3. Aave V4 Position Managers or native lender automation absorb the feature.
  4. A smart-contract incident in custody-adjacent code.

**v4 LP share token:**
- **Revenue:** a performance fee on LP fees (StonkBrokers takes 10%, Beefy 9.5%).
- **Weak:** v4 TVL on Monad is only $27M, and ALM vaults are commoditized.
- **Startup potential: low.**

**Liability-aware position standard:**
- No direct revenue. It is valuable only as a wedge for the obligation-account product.

---

## PART K — Decision Log

**1. Pursue:**
- Open Bucket, narrowed to an isolated obligation account with a permissionless conditional unwind and a liability-aware lens (Aave V3 Monad plus an ERC-4626 vault).

**2. Investigate further, after the hackathon:**
- Measure demand: how many Monad addresses hold Aave/Euler/Curvance debt *and* vault shares? (Use an Envio or Dune-style query.)
- PT-maturity loan handling on Aave Monad and Neverland.
- Async-exit (ERC-7540 / queue) collateral adapters.
- The lens as an ERC.

**3. Abandon:**
- "Make collateral portable" as a protocol (A).
- The universal collateral router (C).
- A standalone Exit Guardian (D, fold it into B).
- A Collateral Passport for the hackathon (E).
- An index DTF on Monad.
- Anything on PSD or Quantum Cadence.
- Tranching.
- Another lending market, LST or DEX.
- A keeper network.

**4. Missing information:**
- Today's judging method, schedule and deadline.
- The Aave V3 Monad addresses and the USDC flash-loan and borrow caps (not collected).
- Which Monad USDC 4626 vaults have synchronous liquidity.
- Metropolis winners (due Nov 3, not found).
- Mumbai V2–V4 winners.
- FastLane Task Manager mainnet status.
- The MonadDB internals.

**5. Five most important unanswered questions:**
1. Is today's Blitz peer-voted or panel-judged, and when is the code freeze?
2. Does a real population of Monad users run cross-protocol borrow-and-deploy positions, or is it a handful of farmers?
3. Are USDC flash loans enabled on Aave V3 Monad, and what are the borrow caps?
4. Will Aave V4 (Position Managers) or DeFi Saver come to Monad in the next six months?
5. Would Curvance, Euler or Gearbox integrate the lens or Bucket rather than treat it as competition?

**6. Immediate next steps (next 30 minutes):**
1. Fork `monad-developers/monad-blitz-devcon-mumbai` (`main`), register the team of 2–3 on blitz.devnads.com, and ask the organizers about judging and the deadline.
2. `foundryup` to ≥ 1.8, then `forge init` with `network = "monad"`.
3. Pull the Aave V3 Monad addresses from bgd-labs/aave-address-book, then confirm reserve configs on a fork with `cast call`.
4. Pick a USDC ERC-4626 vault on Monad and confirm `maxRedeem`.
5. Get a swap API key (Kuru Flow, KyberSwap or 0x) and confirm it returns Monad calldata.
6. Fund the deployer with about 20+ MON (remember gas is charged on the gas *limit*) and about $20 of WETH or cbBTC.

---

## Sources (primary sources used; full URL lists are in the research tracks)

**Event and hackathon**
- Event listing: https://luma.com/Blitz-Mumbai-Devcon-2026
- Submission repo: https://github.com/monad-developers/monad-blitz-devcon-mumbai
- Blitz portal and showcase API: https://blitz.devnads.com/api/showcase
- Mumbai June edition: https://luma.com/blitz-mumbai-june-2026
- Metropolis: https://monad.xyz/developers/hackathons/metropolis

**Monad docs and research**
- https://docs.monad.xyz/developer-essentials/network-information
- https://docs.monad.xyz/developer-essentials/summary
- https://docs.monad.xyz/developer-essentials/differences
- https://docs.monad.xyz/developer-essentials/reserve-balance
- https://docs.monad.xyz/tooling-and-infra/toolkits/foundry.md
- Account abstraction providers: https://docs.monad.xyz/tooling-and-infra/wallet-infra/account-abstraction.md
- Privacy: https://docs.monad.xyz/tooling-and-infra/privacy.md
- Private Settlement white paper: https://category.xyz/mpsd-whitepaper
- Scheduled transactions proposal: https://www.category.xyz/blogs/scheduled-transactions
- Quantum Cadence: https://arxiv.org/abs/2610.32803
- Cadence: https://arxiv.org/abs/2607.02275
- Post-quantum roadmap: https://monad.xyz/blog/post-quantum-roadmap
- Ecosystem overview: https://monad.xyz/blog/monad-economy-eight-months-in

**Market data**
- DefiLlama: https://api.llama.fi/v2/chains, https://api.llama.fi/protocols, https://api.llama.fi/overview/dexs/Monad, https://api.llama.fi/overview/fees/Monad and https://stablecoins.llama.fi/stablecoins (data as of 2026-11-03)

**Monad protocols**
- Aave on Monad: https://governance.aave.com/t/arfc-deploy-aave-protocol-v3-7-on-monad/24943
- Aave PT-USDe listing: https://governance.aave.com/t/direct-to-aip-onboard-pt-usde-22oct2026-to-aave-v3-monad/25414
- Curvance delegation: https://docs.curvance.com/cve/developer-docs/plugin-and-delegation-system
- Gearbox on Monad: https://docs.gearbox.finance/core/gearbox-protocol-monad-lp-opportunity
- Gearbox delayed redemptions: https://docs.gearbox.finance/developers/delayed-redemptions
- Euler EVC: https://docs.euler.finance/developers/evc
- Morpho Bundler3: https://docs.morpho.org/bundlers/contracts/bundler3
- Morpho liquidation and pre-liquidation: https://docs.morpho.org/overview/concepts/liquidation/
- Aave V4 Position Managers: https://aave.com/docs/aave-v4/positions/managers
- Neverland docs: https://docs.neverland.money
- Covenant docs: https://docs.covenant.finance
- FastLane Task Manager: https://shmonad-docs.pages.dev/products/task-manager/overview

**Competitors and automation**
- DeFi Saver technical overview: https://blog.defisaver.com/automated-strategies-technical-overview/
- DeFi Saver supported chains: https://help.defisaver.com/general/compatibility/supported-chains-and-protocols
- Brahma Executor Module: https://docs.brahma.fi/features-and-functionalities/automation/executor-module
- Enso lending shortcuts: https://docs.enso.build/pages/use-cases/lending-markets.md
- Gelato supported networks: https://docs.gelato.cloud/web3-services/web3-functions/supported-networks

**Standards**
- ERC-7540: https://eips.ethereum.org/EIPS/eip-7540
- ERC-7575: https://eips.ethereum.org/EIPS/eip-7575
- ERC-7621: https://eips.ethereum.org/EIPS/eip-7621
- ERC-7726: https://eips.ethereum.org/EIPS/eip-7726
- EIP-4626 discussion thread: https://ethereum-magicians.org/t/eip-4626-yield-bearing-vault-standard/7900/100
- ERC-8240 draft: https://ethereum-magicians.org/t/erc-8240-trust-infrastructure-for-agents-and-assets/28322

**Reserve**
- https://docs.reserve.org/core-components/index-dtfs/overview
- https://github.com/reserve-protocol/reserve-index-dtf
- https://api.llama.fi/protocol/reserve-protocol

**Pair Tokens and Uniswap v4**
- Integration guide: https://stonkbrokers.io/integration/hooks/PairToken-Hookr-Integration.md
- Audit: https://stonkbrokers.io/docs/Hashlock-Certified-Audit-StonkBroker-Hooks.pdf
- Sourcify, chain 4663: source of PairToken.sol, read directly
- Uniswap FullRange example: https://raw.githubusercontent.com/Uniswap/v4-periphery/example-contracts/contracts/hooks/examples/FullRange.sol
- Bunni v2: https://github.com/Bunniapp/bunni-v2
- Bunni shutdown: https://www.theblock.co/post/375813/bunni-dex-shuts-down
- Uniswap v4 deployments: https://developers.uniswap.org/llms.mdx/docs/protocols/v4/deployments

**Incidents**
- Sonne: https://www.certik.com/blog/sonne-finance-incident-analysis
- Resupply: https://ackee.xyz/blog/resupply-hack-analysis/
- Lazy Summer: https://blog.verichains.io/p/lazy-summer-hack-analysis-stale-asset
- Stream xUSD: https://www.theblock.co/post/377491

**BTCFi**
- WBTC custody change: https://unchainedcrypto.com/wbtc-completes-shift-to-multi-jurisdiction-custody-model/
- Sky and WBTC: https://cointelegraph.com/news/maker-sky-eyes-dropping-wrapped-bitcoin-justin-sun
- tBTC redemption: https://docs.threshold.network/app-development/tbtc-sdk/guides/unmint-and-redeem

## Methodology and limitations

- **Method:** six parallel research tracks.
  1. The event and past winners.
  2. Monad technical research, Private Settlement and Quantum Cadence.
  3. The ecosystem, from the DefiLlama APIs.
  4. Pair Tokens: verified Sourcify source plus direct RPC reads on Robinhood Chain and Monad.
  5. DTFs and standards: Folio.sol read on GitHub.
  6. Collateral and automation competitors.
- **What failed:**
  - The StonkBrokers GitHub repo returned 404.
  - Gelato's docs had an expired TLS certificate.
  - DefiLlama's derivatives endpoint is paywalled.
  - Notion info packs did not render.
  - No X/Reddit threads were fetched.
  - The PSD PDF was not opened separately from its web page.
  - The Reserve CEO quote came from an unofficial mirror.
- **Absence claims:** statements such as "not on Monad" or "no product does X" mean *our searches did not find it*. They are not proof.
- **Unverified items:**
  - TVL figures come from DefiLlama, which double-counts curators and vaults.
  - The Aave, Morpho and Euler *Monad* contract addresses were deliberately not collected. Read them from primary sources before use.
- **Untrusted sources:** no source contained text directed at the agents that needed flagging.
