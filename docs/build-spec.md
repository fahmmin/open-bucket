# Open Bucket build spec (hackathon MVP, Monad Blitz Mumbai, 4 Nov 2026)

Audience: the people and agents building it today. Human-facing plan: docs/demo-plan.html.
Verified chain facts live in docs/onchain-facts.md. Never invent an address; read it from there or from an
official source, and label anything unverified.

## 1. What it is

A per-user contract ("bucket") that:
1. takes collateral (WMON preferred, see onchain-facts for what Aave Monad accepts),
2. supplies it to Aave V3 and borrows USDC (variable rate),
3. keeps a small USDC exit buffer and deposits the rest into an allowlisted ERC-4626 USDC vault,
4. stores the owner's exit rules (deadline, minimum health factor, tip),
5. exposes `exit()`: the owner may call it any time; anyone may call it while a rule is true.
   Exit = redeem all vault shares -> repay the whole Aave debt -> withdraw all collateral ->
   pay a capped tip in collateral to a non-owner caller -> send everything else to the owner.

No swaps in the MVP. If vault proceeds + buffer < debt, `exit()` reverts with `Shortfall(uint256 missing)`.
No LLM moves funds. No token. Aave is the only lender. Single-use buckets (closed after exit).

## 2. Repo layout (one folder, `open-bucket/`, later copied into our fork of
github.com/monad-developers/monad-blitz-devcon-mumbai)

```
open-bucket/
  contracts/   Foundry project (forge 1.8.5 is at ~/.foundry/bin, not on PATH)
  agent/       Node 24 + TypeScript + viem: the keeper ("agent") + SSE log server + fork demo helpers
  app/         Vite + React + TypeScript + wagmi/viem web app
  docs/        -> keep using ../docs for plan/spec/facts
```

## 3. Contract interface (the contract between the three teams; do not change without telling everyone)

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

struct Rules {
    uint64 deadline;   // unix seconds; 0 = no deadline rule
    uint64 minHealth;  // Aave health factor, 1e18 = 1.00; 0 = no health rule
    uint16 tipBps;     // tip paid to a non-owner caller, in basis points of withdrawn collateral; <= MAX_TIP_BPS
}

interface IBucket {
    // immutables / config
    function owner() external view returns (address);
    function factory() external view returns (address);
    function pool() external view returns (address);         // Aave V3 Pool
    function collateral() external view returns (address);   // e.g. WMON
    function debtAsset() external view returns (address);    // USDC
    function vault() external view returns (address);        // ERC-4626, asset() == debtAsset
    function MAX_TIP_BPS() external view returns (uint16);   // 50 (= 0.5%)

    // state
    function rules() external view returns (uint64 deadline, uint64 minHealth, uint16 tipBps);
    function opened() external view returns (bool);
    function closed() external view returns (bool);

    // lens (one call, used by app and agent)
    function position() external view returns (
        uint256 collateralAmount, // aToken balance (collateral units)
        uint256 vaultShares,
        uint256 vaultAssets,      // vault.previewRedeem(vaultShares), USDC units
        uint256 idleDebtAsset,    // USDC sitting in the bucket (the buffer)
        uint256 debt,             // variable debt token balance, USDC units
        uint256 healthFactor      // from Pool.getUserAccountData, 1e18 = 1.00; type(uint256).max when no debt
    );
    function canExit() external view returns (bool ok, uint8 reason); // reason: 0 none, 1 deadline, 2 health

    // actions
    function open(uint256 collateralAmount, uint256 borrowAmount, uint256 bufferAmount) external; // factory only, once
    function setRules(Rules calldata r) external;   // owner only, while open
    function exit() external;                       // owner any time; others only if canExit().ok
    function rescue(address token) external;        // owner only; sends full balance of `token` to owner

    event Opened(uint256 collateralAmount, uint256 borrowed, uint256 deposited, uint256 shares);
    event RulesSet(uint64 deadline, uint64 minHealth, uint16 tipBps);
    event Exited(address indexed caller, uint8 reason, uint256 debtRepaid, uint256 collateralToOwner,
                 uint256 debtAssetToOwner, uint256 tip);

    error NotOwner(); error NotFactory(); error AlreadyOpen(); error Closed();
    error NoRuleTriggered(); error TipTooHigh(); error Shortfall(uint256 missing);
}

interface IBucketFactory {
    function pool() external view returns (address);
    function wmon() external view returns (address);
    function isVaultAllowed(address vault) external view returns (bool);
    function allowedVaults() external view returns (address[] memory);
    function bucketsOf(address owner) external view returns (address[] memory);
    function allBuckets() external view returns (address[] memory);

    // Creates a bucket for msg.sender and opens it in the same transaction.
    // If msg.value > 0: collateral must be WMON, msg.value is wrapped (collateralAmount must equal msg.value).
    // Else: pulls `collateralAmount` of `collateral` from msg.sender (needs prior approve to the factory).
    function createAndOpen(address collateral, address vault, uint256 collateralAmount, uint256 borrowAmount,
                           uint256 bufferAmount, Rules calldata rules) external payable returns (address bucket);

    function setVaultAllowed(address vault, bool allowed) external; // factory admin only
    event Created(address indexed owner, address indexed bucket, address collateral, address vault);
}
```

Implementation notes:
- Bucket is deployed with `new Bucket(...)` by the factory (no clones; simpler). It is its own Aave account.
- aToken / variableDebtToken addresses: pass them in from the factory (read once via
  `Pool.getReserveData(asset)` at create time, or from the address book) so the bucket never depends on
  the Aave version's struct layout at exit time. Pick whichever is verified in onchain-facts.md.
- Repay the full debt with `pool.repay(debtAsset, type(uint256).max, 2, address(this))`; check balance >= debt
  first and revert `Shortfall(debt - balance)` otherwise. Withdraw with `pool.withdraw(collateral, type(uint256).max, address(this))`.
- State changes before external transfers (set `closed = true` first). Reentrancy guard on `exit` and `rescue`.
  Use OpenZeppelin SafeERC20 / ReentrancyGuard (install with forge, MIT).
- Tip: only when `msg.sender != owner`, `tip = withdrawn * tipBps / 10_000`, paid in collateral.
- Leftover USDC (vault yield + unused buffer) goes to the owner. Return collateral as WMON (no unwrap).
- Monad specifics: TIMESTAMP has 1-second granularity (fine for deadlines); gas is charged on the gas LIMIT,
  so the agent must send exits with an estimated limit (+20%), never a huge fixed one.

## 4. Tests (Foundry, on a fork of Monad mainnet; `forge test --fork-url $MONAD_RPC_URL`)

Must pass before anything is deployed:
1. createAndOpen with native MON: aToken balance == amount, debt == borrow, vault shares > 0, buffer held.
2. Owner exit at any time: debt 0, collateral (WMON) and leftover USDC back to owner, closed == true.
3. Stranger exit with no rule true -> NoRuleTriggered.
4. Deadline passed (vm.warp) -> stranger exit succeeds; owner gets collateral minus tip; stranger gets exactly the tip.
5. Health below floor: `vm.mockCall` the Aave oracle's `getAssetPrice(collateral)` to a lower price ->
   canExit() == (true, 2) -> stranger exit succeeds, payout to owner.
6. Second exit -> Closed. setRules after exit -> Closed.
7. Shortfall: make the vault return less (mockCall previewRedeem/redeem, or tiny buffer + warp a long time) -> Shortfall.
8. Only owner: setRules, rescue; only factory: open; tipBps > MAX -> TipTooHigh.
9. Fuzz: price drop 0-40% and warp 0-30 days; after a permitted exit, owner's collateral == withdrawn - tip
   and the caller never receives more than the tip.

## 5. Agent (agent/)

- `src/decide.ts`: pure function `decide(position, rules, nowSec) -> { action: 'hold' | 'exit', reason }`
  mirroring `canExit()` (unit-tested with node:test). The contract is the source of truth; the agent always
  re-checks `canExit()` onchain right before sending.
- `src/agent.ts`: loads buckets from factory `Created` logs + `allBuckets()`, watches new blocks
  (websocket if available, else HTTP polling every 250 ms), multicalls `position()`, `rules()`, `canExit()`
  for open buckets each block, sends `exit()` once per bucket (in-flight set), gas = estimate * 1.2.
  `DRY_RUN=1` logs without sending.
- SSE server on http://localhost:8787/events streaming JSON lines:
  `{ t, block, bucket, health, deadlineIn, decision: 'hold'|'exit'|'sent'|'confirmed'|'error', reason?, tx? }`.
  CORS open for localhost.
- Fork demo helpers (fork only, refuse to run unless RPC is 127.0.0.1/localhost):
  `fork:start` (anvil --fork-url $MONAD_RPC_URL, chain id stays 143), `fork:setup` (deploy factory, open a
  bucket and an identical plain Aave position from two anvil accounts, replace the collateral's oracle source
  code with a settable mock feed via anvil_setCode), `fork:price <pct>` (set price), `fork:liquidator`
  (watches the plain position and calls Aave `liquidationCall` when HF < 1, using its own Aave loan for USDC),
  snapshot/revert for reset.

## 6. App (app/)

Design direction (same as the plan page): cool light "instrument panel".
- Tokens: paper #F3F4F8, surface #FFFFFF, sunk #ECEEF4, ink #151722, muted #575C6E, line #D9DCE6,
  accent #5B45E0; semantic ok #11795A, warn #995900, bad #BC3126 (soft variants as on the plan page);
  fork banner #FFE49A on #4A3300. Light theme first (projector), dark optional.
- Type: Schibsted Grotesk (UI and numbers, tabular-nums) + IBM Plex Mono (addresses, hashes, block numbers only).
- Signature elements: the bucket as an accounting T-account (what it holds | what it owes, equity below);
  the health ruler from 0.90 to 1.60 with marks at 1.00 (liquidation) and the owner's exit line; the agent log
  as a mono list, one line per block, newest on top. The log ticking is the only ambient motion.
- Projector first: min body 16px, key numbers 28px+, everything readable at 1920x1080 / 125% zoom.
- Copy: plain words, sentence case, buttons say what happens ("Open bucket", "Exit now", "Drop price 4%").

Screens:
1. Routes (`#routes`, default): one row per (collateral, allowlisted vault). Live: Aave USDC variable borrow
   APR (ray -> %), vault APY (DefiLlama yields by vault address if present, else "not available"), vault TVL
   (totalAssets). Expand a row -> amounts form + rules + "What this route will do" (each step names the
   contract and links to the explorer) + "How the exit works" + risks + preview (health after open,
   liquidation price, computed from Aave reserve params and AaveOracle price) -> "Open bucket" (one tx with
   native MON value).
2. Bucket (`#bucket-<address>`): T-account from `position()`, equity in USD using AaveOracle prices,
   health ruler, rules with triggered state, "Exit now" (owner), "Edit rules", agent log from the SSE stream
   (if the agent is offline, say so plainly), history from Opened/Exited events with explorer links.
3. Crash (`#crash`, only when the app points at the local fork): yellow fork banner, price readout,
   "Drop price 4%" and "Reset" buttons, two columns (plain Aave position vs bucket) each with the health ruler
   and status, verdict built from the actual LiquidationCall and Exited events (amounts, tip).
Global: header with network state, wallet button (injected connector), wrong-network prompt, FORK banner
whenever RPC is localhost. Every number comes from a contract read or a named API; nothing hard-coded.

Config via env: VITE_RPC_URL, VITE_FACTORY, VITE_AGENT_SSE (default http://localhost:8787/events),
VITE_EXPLORER (MonadVision base URL), VITE_PLAIN_POSITION and VITE_DEMO_BUCKET (fork crash screen).

## 7. Done means

- `forge test` green on a Monad mainnet fork; factory deployed and verified on mainnet; one real bucket open.
- Agent runs against mainnet in dry-run and live mode; exits the real bucket when its deadline passes.
- App shows all three screens with real reads; crash screen works end to end on the fork with reset.
- Three timed rehearsals under 2:50; backup recording saved.
