# Going to Monad mainnet (you run these; they move real funds)

Prices read live at 16:45 IST, 4 Nov 2026: gas 102 gwei, MON $0.0185 (Chainlink MON/USD),
WETH $2,326.56 (AaveOracle). Monad charges the gas LIMIT, so these use limit, not gas used.

## What it costs

| Step | Gas limit (from our runs) | MON | USD |
|---|---|---|---|
| Deploy BucketFactory | ~4.0M | 0.41 | $0.008 |
| Allowlist the SharpByte vault | ~0.15M | 0.02 | $0.0003 |
| Approve WETH | ~0.1M | 0.01 | $0.0002 |
| Open a bucket (deploy + Aave supply + borrow + vault deposit) | ~4.3M | 0.44 | $0.008 |
| Agent exit | ~1.0M | 0.10 | $0.002 |
| **Total** | **~9.6M** | **~1 MON** | **~$0.02** |

Money you actually need:
- **Gas: about 30 MON (~$0.55)** split across the deployer and the keeper, so neither runs dry.
  Keep ~10 MON spare in each sending account to be safe.
- **Collateral: 0.02 to 0.05 WETH ($46 to $116).** USDC is borrowed, not bought. At 0.05 WETH
  and health ~2.0 you borrow about $48 USDC.
- Getting WETH onto Monad: bridge ETH in, or swap MON for WETH on Monad (KyberSwap quoted 1 WETH
  at ~2,320 USDC this afternoon; the Uniswap v3 WETH/USDC pool is too thin to use).

## Steps

1. Put MON and WETH in a fresh burner wallet on Monad mainnet. Import it into Foundry in your own
   terminal (you choose the password; never paste the key into chat):
   `~/.foundry/bin/cast wallet import mainnet-burner --interactive`
2. Deploy and verify (from `open-bucket/contracts`):
   ```
   AAVE_POOL=0x69a5F9AD4f96ebf0a0C792dD42a01cC5C0102fef WMON=0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A \
   USDC=0x754704Bc059F8C67012fEd69BC8A327a5aafb603 VAULTS=0xf57E9898575fab80b0f2aCDe5443276BeC8C542D \
   ~/.foundry/bin/forge script script/Deploy.s.sol --rpc-url https://rpc.monad.xyz --account mainnet-burner --broadcast
   ```
   Verify the printed factory on Sourcify:
   `forge verify-contract <factory> src/BucketFactory.sol:BucketFactory --chain 143 --verifier sourcify --verifier-url https://sourcify-api-monad.blockvision.org --constructor-args $(cast abi-encode "c(address,address,address,address)" 0x69a5F9AD4f96ebf0a0C792dD42a01cC5C0102fef 0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A 0x754704Bc059F8C67012fEd69BC8A327a5aafb603 <your address>)`
3. Put the factory in `app/.env.mainnet` (VITE_FACTORY) and run `npm run dev:mainnet` (port 5176).
   Open a bucket from Discover with MetaMask: 0.05 WETH, borrow at health ~2.0, exit line 1.15.
4. Run the agent on mainnet with any account that holds MON for gas, in your own terminal:
   `CHAIN_ID=143 RPC_URL=https://rpc.monad.xyz WS_URL=wss://rpc.monad.xyz FACTORY=<factory> DRY_RUN=0 PORT=8789 PRIVATE_KEY=... npm start`
   Start with `DRY_RUN=1` once to see it read your bucket without sending anything.

## What mainnet adds to the demo (beyond "we deployed")

- A judge can click one MonadVision link and see real aWETH, real Aave debt and real Morpho vault
  shares held by the bucket. Nothing on screen is simulated.
- The agent log ticks at Monad's real block speed (the fork ticks once a second).
- The closer becomes a real mainnet exit: rule fires, the agent exits in the next block, and the
  receipt shows the true cost (a fraction of a cent of gas plus the 0.1% tip).
- My money shows real earnings accruing: honest but tiny (about +$0.005 a day on a $116 position).

## The honest PnL answer

The carry (vault yield minus borrow cost, ~3.7% a year) is real but small at demo size. The money
story is the loss avoided: on Aave Monad's WETH, a liquidation hands the liquidator a 5.5% bonus on
the part it repays. Our fork run with the real market: 0.042 WETH (~$97 at today's price, $64 at the
crashed price) lost to liquidation versus a 0.002 WETH tip with the bucket.
