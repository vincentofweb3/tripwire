# Verification

This page tracks, claim by claim, how to verify everything Tripwire asserts. It is updated as the buildathon proceeds; final submission replaces all TBD markers.

## On-chain artifacts

| Claim | Where to check | Status |
| --- | --- | --- |
| TripwireReactive deployed on Lasna | [`lasna.reactscan.net/address/0xcb581677E8C94e1aEF29033D27e57F0597C67e01`](https://lasna.reactscan.net/address/0xcb581677E8C94e1aEF29033D27e57F0597C67e01) | Deployed |
| TripwireExecutor deployed on Unichain Sepolia | [`sepolia.uniscan.xyz/address/0x29D685cb7574443eD28A24541Dd8FeaD4C0F4A87`](https://sepolia.uniscan.xyz/address/0x29D685cb7574443eD28A24541Dd8FeaD4C0F4A87) | Deployed |
| TripwireExecutor deployed on Base Sepolia | [`sepolia.basescan.org/address/0xDE9AE68d44e41bC2b658623b16dd4c1a2f5993A0`](https://sepolia.basescan.org/address/0xDE9AE68d44e41bC2b658623b16dd4c1a2f5993A0) | Deployed |
| Sourcify verification (v1 deploys, submitted) | jobs `b3c779bb…` (1301), `b6cc2c61…` (84532), `6388922a…` (5318007) | Jobs submitted; outcome pending / needs re-submission for v2 |
| Full loop Base Sepolia: swap [`0xef50b9…`](https://sepolia.basescan.org/tx/0xef50b91d049b04228e6e1e98d7860b765fd4f38e9e5e779cffaa20fab1fddb6d) → reactive [`0x24b7b4…`](https://lasna.reactscan.net/tx/0x24b7b4e344e93c15190d57282635120c03b1839d1a4fd9e398919ddee1afd8a8) → callback [`0x2dee51…`](https://sepolia.basescan.org/tx/0x2dee510094f6955d46ccce7af5ab9c540e87274a1fb9e9dfa4f66e3f3c053e2d) | All three txs live on the respective explorers | Verified · 2.00s |
| Full loop Unichain Sepolia: swap [`0x84b2a6…`](https://sepolia.uniscan.xyz/tx/0x84b2a69bd62d1c533a04b194b5d17fb992fa107e3f0956c47c0b8c2911424416) → reactive [`0xd99864…`](https://lasna.reactscan.net/tx/0xd99864800b1b1e58e9145cb104733e7f8130c4d6ef589d2cdf67aa73243a85de) → callback [`0x5b57e6…`](https://sepolia.uniscan.xyz/tx/0x5b57e668dc0c9c536b0afada254d5c54a689437a3c61d8e5d30383c1c71607d0) | All three txs live on the respective explorers | Verified · 2.00s |
| Loop latency numbers | README evidence table + app `/evidence` + `app/public/runs.json` | Verified |
| Reactive filters active | `rnk_getFilters` RPC — all 8 filters for the v2 contracts report `"Active": true` | Verified |
| Executor reserves on callback proxies | Unichain `0x775c…` and Base `0x476F…` balances increased by exactly 0.001 ETH each (v2 deploys) | Verified (balance delta) |
| v1 → v2 redeploy story | v1 reactive (`0x239E…`) went in-debt on its first `react()` call (debt 0.0226 lREACT > 0.02 balance) → Lasna set `"Active": false` on its subscriptions → redeployed as v2 with a public `coverDebt()` and 1 lREACT endowment | Documented in README Design notes |

## Test artifacts

- `contracts/`: `forge test` → 21 passed. Reproduce: `forge test -vv` in `contracts/`.
- `app/`: `npm run typecheck`, `npm run lint`, `npm test` (5 vitest unit tests on the price math), `npm run build`.

## Claims about behavior

1. **Executor only executes crossed orders.** Unit tests `test_executeNotCrossedSkips`, `test_executeExpiredSkips`, `test_executeFillsAndDisarms`; live: `OrderExecuted` events only follow swaps past the trigger.
2. **One-shot.** Unit tests `test_orderLifecycleAndFire` (no second callback) and `OrderDisarmed` on cancel.
3. **Executor never trusts the callback.** Code: `TripwireExecutor.execute` re-reads `slot0()` after the armed/deadline checks.
4. **Base Sepolia timing uses timestamps.** Grep: no `block.number` comparisons anywhere in `contracts/src`.

## Limitations of this verification

- Testnets only; no mainnet claims are made.
- Verification on Base Sepolia/Unichain Sepolia explorers is manual where Sourcify does not index them; links are collected here as they are produced, not pre-asserted.


## Live deployment

- App: https://tripwire-alpha-three.vercel.app/ (Vercel, root `app/`, env `VITE_EXECUTOR_*` set at import)
- `/evidence` renders `app/public/runs.json` — both recorded loops, 2.00s each.
