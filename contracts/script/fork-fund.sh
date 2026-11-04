#!/usr/bin/env bash
# LOCAL ANVIL FORK ONLY. Gives the demo accounts WETH by impersonating Aave's aWETH contract, which holds
# the pool's WETH liquidity. Accounts: anvil #0 (Synpress tests), #1 (bucket owner), #2 (plain position),
# #3 (liquidator). Refuses to run against anything but a local Monad mainnet fork.
set -euo pipefail
export PATH="$HOME/.foundry/bin:$PATH"
RPC="${RPC:-http://127.0.0.1:8545}"
case "$RPC" in *127.0.0.1*|*localhost*) ;; *) echo "refusing: $RPC is not a local fork"; exit 1 ;; esac
[ "$(cast chain-id --rpc-url "$RPC")" = "143" ] || { echo "refusing: not a fork of Monad mainnet"; exit 1; }

WETH=0xEE8c0E9f1BFFb4Eb878d8f15f368A02a35481242
AWETH=0x4377b53aAA8b8e3fF7AA2843832CAF004f5Cb8b6
AMOUNT="${AMOUNT:-20ether}"

cast rpc anvil_impersonateAccount "$AWETH" --rpc-url "$RPC" >/dev/null
cast rpc anvil_setBalance "$AWETH" 0x56BC75E2D63100000 --rpc-url "$RPC" >/dev/null # 100 MON for gas
for ACC in 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 \
           0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC 0x90F79bf6EB2c4f870365E785982E1f101E93b906; do
  cast send "$WETH" "transfer(address,uint256)" "$ACC" "$AMOUNT" --from "$AWETH" --unlocked --rpc-url "$RPC" >/dev/null
  echo "$ACC WETH: $(cast call "$WETH" 'balanceOf(address)(uint256)' "$ACC" --rpc-url "$RPC")"
done
cast rpc anvil_stopImpersonatingAccount "$AWETH" --rpc-url "$RPC" >/dev/null
