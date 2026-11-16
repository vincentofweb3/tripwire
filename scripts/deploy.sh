#!/usr/bin/env bash
# Deploys Tripwire. Interactive: prompts for the keystore passphrase.
# Usage: ./scripts/deploy.sh
set -euo pipefail

REACTIVE_RPC="${LASNA_RPC:-https://lasna-rpc.rnk.dev}"
UNICHAIN_RPC="${UNICHAIN_SEPOLIA_RPC:-https://sepolia.unichain.org}"
BASE_RPC="${BASE_SEPOLIA_RPC:-https://sepolia.base.org}"

ACCOUNT="${TRIPWIRE_ACCOUNT:-tripwire-deployer}"

echo "== 1/3 Reactive contract on Lasna =="
forge create src/TripwireReactive.sol:TripwireReactive \
  --broadcast --rpc-url "$REACTIVE_RPC" --account "$ACCOUNT" --value 0.05ether

echo "Set REACTIVE_CONTRACT=<address printed above> when prompted for wiring."
echo ""
echo "== 2/3 Executors =="
echo "Unichain Sepolia:"
forge create src/TripwireExecutor.sol:TripwireExecutor \
  --broadcast --rpc-url "$UNICHAIN_RPC" --account "$ACCOUNT" \
  --constructor-args 0x775c9B990ADe401060B78D0e98684eEf8d2466C1 "$REACTIVE_CONTRACT" 0xd1AAE39293221B77B0C71fBD6dCb7Ea29Bb5B166

echo "Base Sepolia:"
forge create src/TripwireExecutor.sol:TripwireExecutor \
  --broadcast --rpc-url "$BASE_RPC" --account "$ACCOUNT" \
  --constructor-args 0x476F44b11F5C942c58f4c8E3d0300E5710743585 "$REACTIVE_CONTRACT" 0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4

echo ""
echo "== 3/3 Wire the reactive contract (owner transactions on Lasna) =="
REACTIVE_ADDR="$REACTIVE_CONTRACT"
UNICHAIN_EXECUTOR="$EXECUTOR_1301"
BASE_EXECUTOR="$EXECUTOR_84532"

cast send --rpc-url "$REACTIVE_RPC" --account "$ACCOUNT" "$REACTIVE_ADDR" "addPool(uint256,address)" 1301 0x8F463126bBEA80A10DF9Bf6FF5455B6B0292B34e
cast send --rpc-url "$REACTIVE_RPC" --account "$ACCOUNT" "$REACTIVE_ADDR" "addPool(uint256,address)" 84532 0x46880b404CD35c165EDdefF7421019F8dD25F4Ad
cast send --rpc-url "$REACTIVE_RPC" --account "$ACCOUNT" "$REACTIVE_ADDR" "addPool(uint256,address)" 1301 0xBeAD5792bB6C299AB11Eaa425aC3fE11ebA47b3B
cast send --rpc-url "$REACTIVE_RPC" --account "$ACCOUNT" "$REACTIVE_ADDR" "addPool(uint256,address)" 84532 0x94bfc0574FF48E92cE43d495376C477B1d0EEeC0

cast send --rpc-url "$REACTIVE_RPC" --account "$ACCOUNT" "$REACTIVE_ADDR" "addExecutor(uint256,address)" 1301 "$UNICHAIN_EXECUTOR"
cast send --rpc-url "$REACTIVE_RPC" --account "$ACCOUNT" "$REACTIVE_ADDR" "addExecutor(uint256,address)" 84532 "$BASE_EXECUTOR"

echo "Done. Fund callback reserves:"
echo "  cast send --rpc-url <dest-rpc> --account $ACCOUNT 0x775c9B990ADe401060B78D0e98684eEf8d2466C1 'depositTo(address)' <UNICHAIN_EXECUTOR> --value 0.02ether"
echo "  cast send --rpc-url <dest-rpc> --account $ACCOUNT 0x476F44b11F5C942c58f4c8E3d0300E5710743585 'depositTo(address)' <BASE_EXECUTOR> --value 0.02ether"
