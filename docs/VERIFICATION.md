# Verification

This page tracks, claim by claim, how to verify everything Tripwire asserts. It is updated as the buildathon proceeds; final submission replaces all TBD markers.

## On-chain artifacts

| Claim | Where to check | Status |
| --- | --- | --- |
| TripwireReactive deployed on Lasna | `lasna.reactscan.net/address/<TBD>` | TBD |
| TripwireExecutor deployed on Unichain Sepolia | `sepolia.uniscan.xyz/address/<TBD>` | TBD |
| TripwireExecutor deployed on Base Sepolia | `sepolia.basescan.org/address/<TBD>` | TBD |
| Sourcify verification (all three) | `https://repo.sourcify.dev/contracts/5318007/<addr>/` etc. | TBD |
| Full loop tx: origin swap | `<explorer>/tx/<TBD>` | TBD |
| Full loop tx: Lasna reactive transaction | `https://lasna.reactscan.net/tx/<TBD>` | TBD |
| Full loop tx: destination callback (`execute`) | `<explorer>/tx/<TBD>` | TBD |
| Loop latency numbers | README evidence table + app `/evidence` | TBD |
| Executor reserves on callback proxies | `cast call <proxy> "deposits(address)(uint256)" <executor>` (verify proxy ABI on docs) | TBD |

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
