#!/usr/bin/env bash
# MONAD TESTNET ONLY. Opens a fresh bucket whose deadline lands during the pitch, for the closer:
#   bash script/testnet-closer.sh 160     # deadline 160 seconds from now (start it as you walk on stage)
# Uses PRIVATE_KEY from the repo-root .env (testnet burner). Needs the testnet agent running to exit it.
set -euo pipefail
export PATH="$HOME/.foundry/bin:$PATH"
SECS="${1:-160}"
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
set -a; . "$ROOT/.env"; set +a
R=https://testnet-rpc.monad.xyz
[ "$(cast chain-id --rpc-url $R)" = "10143" ] || { echo "not Monad testnet"; exit 1; }
F=0x941Fb69F3b87315de42Ca06AEB5d8C4109685102   # BucketFactory
W=0x11e65932196B07617180A8Fc5D1885BFd1170e9F   # TestWETH (faucet)
V=0x99699EebD54435077F612938Cd3dD250d2f92bc2   # TestVault
ME=$(cast wallet address --private-key "$PRIVATE_KEY")

cast send $W "faucet()" --private-key "$PRIVATE_KEY" --rpc-url $R >/dev/null
cast send $W "approve(address,uint256)" $F 1000000000000000000 --private-key "$PRIVATE_KEY" --rpc-url $R >/dev/null
NOW=$(cast block latest --field timestamp --rpc-url $R)   # chain time, which the contract uses
DL=$(( NOW + SECS ))
cast send $F "createAndOpen(address,address,uint256,uint256,uint256,(uint64,uint64,uint16))" \
  $W $V 1000000000000000000 1000000000 10000000 "($DL,1150000000000000000,10)" \
  --private-key "$PRIVATE_KEY" --rpc-url $R >/dev/null
B=$(cast call $F "bucketsOf(address)(address[])" $ME --rpc-url $R | grep -oE '0x[0-9a-fA-F]{40}' | tail -1)
echo "bucket:   $B"
echo "deadline: chain time $DL (in ${SECS}s)"
echo "open:     http://localhost:5174/#bucket-$B"
