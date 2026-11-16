#!/usr/bin/env bash
# One-command Tripwire deployment. YOU run this (prompts for keystore passphrase):
#   cd ~/tripwire && ./scripts/deploy-testnet-v2.sh
#
# What it does (v2 — reactive was blacklisted in debt; contract now exposes coverDebt()):
#   1. (conversion skipped; deployer already holds ~4.8 lREACT)
#   2. Deploys TripwireReactive v2 on Lasna (1 lREACT endowment)
#   3. Deploys TripwireExecutor on Unichain Sepolia and Base Sepolia
#   4. Attempts Sourcify verification on all three contracts (tolerates failure)
#   5. Wires the reactive contract: addPool x4 (0.05%/0.3% pools both chains), addExecutor x2
#   6. Deposits 0.005 native ETH into each callback proxy for executor reserves
#   7. Writes app/.env with the executor addresses
#
# Outputs .deploy/addresses.env with all addresses and tx hashes.
set -euo pipefail
export PATH="$HOME/.foundry/bin:$PATH"

ACCOUNT="${TRIPWIRE_ACCOUNT:-tripwire-deployer}"
DEPLOYER="0x126b2A2C43Ad0c1Cb3CDCa63a43Cd3b91Bf71EB9"
REACTIVE_RPC="${LASNA_RPC:-https://lasna-rpc.rnk.dev}"
UNI_RPC="${UNICHAIN_SEPOLIA_RPC:-https://sepolia.unichain.org}"
BASE_RPC="${BASE_SEPOLIA_RPC:-https://sepolia.base.org}"
BASE_FAUCET="0x2afaFD298b23b62760711756088F75B7409f5967"

mkdir -p .deploy
: > .deploy/addresses.env

cd "$(dirname "$0")/../contracts"

echo "== step 1/7: (skip conversion; deployer already holds lREACT) =="

echo ""
echo "== step 2/7: deploy TripwireReactive on Lasna =="
forge create --broadcast --rpc-url "$REACTIVE_RPC" --account "$ACCOUNT" \
  --value 1ether --json src/TripwireReactive.sol:TripwireReactive > ../.deploy/reactive.json
python3 - <<'PY'
import json
d = json.load(open("../.deploy/reactive.json"))
print("reactive:", d["deployedTo"], "tx:", d["transactionHash"])
open("../.deploy/addresses.env","a").write(f'REACTIVE_CONTRACT={d["deployedTo"]}\nREACTIVE_DEPLOY_TX={d["transactionHash"]}\n')
PY
source ../.deploy/addresses.env

echo ""
echo "== step 3/7: deploy TripwireExecutor =="
forge create --broadcast --rpc-url "$UNI_RPC" --account "$ACCOUNT" --json \
  src/TripwireExecutor.sol:TripwireExecutor \
  --constructor-args 0x775c9B990ADe401060B78D0e98684eEf8d2466C1 "$REACTIVE_CONTRACT" 0xd1AAE39293221B77B0C71fBD6dCb7Ea29Bb5B166 > ../.deploy/executor-uni.json
forge create --broadcast --rpc-url "$BASE_RPC" --account "$ACCOUNT" --json \
  src/TripwireExecutor.sol:TripwireExecutor \
  --constructor-args 0x476F44b11F5C942c58f4c8E3d0300E5710743585 "$REACTIVE_CONTRACT" 0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4 > ../.deploy/executor-base.json
python3 - <<'PY'
import json
u = json.load(open("../.deploy/executor-uni.json"))
b = json.load(open("../.deploy/executor-base.json"))
print("executor (uni): ", u["deployedTo"], "tx:", u["transactionHash"])
print("executor (base):", b["deployedTo"], "tx:", b["transactionHash"])
open("../.deploy/addresses.env","a").write(f'EXECUTOR_UNICHAIN={u["deployedTo"]}\nEXECUTOR_UNICHAIN_TX={u["transactionHash"]}\nEXECUTOR_BASE={b["deployedTo"]}\nEXECUTOR_BASE_TX={b["transactionHash"]}\n')
PY
source ../.deploy/addresses.env

echo ""
echo "== step 4/7: Sourcify verification (tolerates failure) =="
forge verify-contract --verifier sourcify --chain-id 5318007 "$REACTIVE_CONTRACT" src/TripwireReactive.sol:TripwireReactive || echo "WARN: Sourcify verification failed for Lasna reactive (manual verification possible)"
forge verify-contract --verifier sourcify --chain-id 1301 "$EXECUTOR_UNICHAIN" src/TripwireExecutor.sol:TripwireExecutor || echo "WARN: Sourcify verification failed for Unichain Sepolia executor"
forge verify-contract --verifier sourcify --chain-id 84532 "$EXECUTOR_BASE" src/TripwireExecutor.sol:TripwireExecutor || echo "WARN: Sourcify verification failed for Base Sepolia executor"

echo ""
echo "== step 5/7: wire reactive contract =="
cast send --rpc-url "$REACTIVE_RPC" --account "$ACCOUNT" "$REACTIVE_CONTRACT" "addPool(uint256,address)" 1301 0x8F463126bBEA80A10DF9Bf6FF5455B6B0292B34e | tee -a ../.deploy/wiring.log
cast send --rpc-url "$REACTIVE_RPC" --account "$ACCOUNT" "$REACTIVE_CONTRACT" "addPool(uint256,address)" 1301 0xBeAD5792bB6C299AB11Eaa425aC3fE11ebA47b3B | tee -a ../.deploy/wiring.log
cast send --rpc-url "$REACTIVE_RPC" --account "$ACCOUNT" "$REACTIVE_CONTRACT" "addPool(uint256,address)" 84532 0x46880b404CD35c165EDdefF7421019F8dD25F4Ad | tee -a ../.deploy/wiring.log
cast send --rpc-url "$REACTIVE_RPC" --account "$ACCOUNT" "$REACTIVE_CONTRACT" "addPool(uint256,address)" 84532 0x94bfc0574FF48E92cE43d495376C477B1d0EEeC0 | tee -a ../.deploy/wiring.log
cast send --rpc-url "$REACTIVE_RPC" --account "$ACCOUNT" "$REACTIVE_CONTRACT" "addExecutor(uint256,address)" 1301 "$EXECUTOR_UNICHAIN" | tee -a ../.deploy/wiring.log
cast send --rpc-url "$REACTIVE_RPC" --account "$ACCOUNT" "$REACTIVE_CONTRACT" "addExecutor(uint256,address)" 84532 "$EXECUTOR_BASE" | tee -a ../.deploy/wiring.log

echo ""
echo "== step 6/7: callback proxy reserves (0.005 ETH each) =="
cast send --rpc-url "$UNI_RPC" --account "$ACCOUNT" 0x775c9B990ADe401060B78D0e98684eEf8d2466C1 "depositTo(address)" "$EXECUTOR_UNICHAIN" --value 0.001ether | tee -a ../.deploy/wiring.log
cast send --rpc-url "$BASE_RPC" --account "$ACCOUNT" 0x476F44b11F5C942c58f4c8E3d0300E5710743585 "depositTo(address)" "$EXECUTOR_BASE" --value 0.001ether | tee -a ../.deploy/wiring.log

echo ""
echo "== step 7/7: write app/.env =="
cat > ../app/.env <<EOF
VITE_EXECUTOR_UNICHAIN_SEPOLIA=$EXECUTOR_UNICHAIN
VITE_EXECUTOR_BASE_SEPOLIA=$EXECUTOR_BASE
EOF

echo ""
echo "All done. Summary:"
cat ../.deploy/addresses.env
