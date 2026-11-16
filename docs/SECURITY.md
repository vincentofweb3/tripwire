# Security

## Threat model

| Threat | Mitigation |
|---|---|
| Reactive contract compromised / malicious callback | Executor ignores any caller except its immutable per-chain `CALLBACK_PROXY`, and any injected `reactive_` except its immutable `REACTIVE_SENDER`. Price is re-read from `pool.slot0()`; a forged callback can at best fill an order that is already legitimately crossed — exactly what it is supposed to do. |
| Sandwich / MEV around the fill | `minOut` (`amountOutMinimum`) is fixed by the user at creation and enforced by the router inside the pool's own swap callback. An unfavorable price moves the fill against `minOut` and the whole callback reverts; the escrow is untouched and the order stays escrowed (one-shot, cancellable). |
| Stale price used for trigger | None — the reactive trigger only *requests* the fill; the executor re-checks `slot0()` in the same transaction that swaps. |
| Double execution | Executor sets `armed = false` before the router call (reverts roll it back on failure); Reactive marks the order fired before requesting the callback. Two independent one-shot guards. |
| Re-entrancy | `nonReentrant` on `createOrder`, `cancelOrder`, `execute`. Checks-effects-interactions throughout. |
| Expired orders executing | `deadline` is `block.timestamp`-based (never block counts — mandatory on Base Sepolia's 200ms blocks) and re-checked at execution. |
| Router drains approval | Approval is exactly `amountIn`, set at creation, and reset to 0 on cancel. The router pulls exactly `amountIn` at most once (order disarms on fill). |
| Escrow locked forever | `cancelOrder` is always available to the owner while armed. No time, role, or condition can block it. |
| Admin abuse | There is no admin. No owner, upgrade, pause, fee, rescue, or blacklist entry points anywhere in either contract. `OWNER` on the reactive contract can only wire pools/executors (set once) and never touches funds, orders, or executor behavior. |
| Debt blocking callbacks | Executors stay credited on their chain's callback proxy via `depositTo`; anyone can top up reserves. Reactive contracts settle debt on demand with the inherited `coverDebt()`. |
| Reorg / inconsistent log reading | Reactive Omni is deterministic-finality (CometBFT). Origin chains (Unichain Sepolia, Base Sepolia) do not reorg in practice on their testnets; a reorged `Swap` log can request at most an already-crossed, already-armed order. |

## Non-goals / accepted residuals

- **Testnet only in this submission.** Test tokens carry no value; do not point Tripwire at mainnet pools without an independent audit.
- **Oracle-free trigger, not oracle-grade.** The trigger is the pool's own last traded price. On a thin pool, one large swap is the price — that is the definition of "stop-loss triggered by market flow", not a Pyth/Chainlink-style deviation-checked feed.
- **No partial fills.** Orders are fill-or-cancel via `cancelOrder`.
- **Fired-while-failed is terminal.** If the callback reverts, one-shot semantics on the reactive side prevent auto-retry. The user reclaims via cancel.
- **Book capacity.** 64 armed orders per chain+pool on the reactive side; beyond that `react()` reverts visibly (`ReactiveContractReverted`), never silently drops.

## Testing

- 21 Foundry tests: executor unit/invariants (escrow accounting, approval lifecycle, callback gating, slippage revert, cancel path) and reactive logic (subscription wiring, order lifecycle, one-shot fire, cancel suppression, expiry, duplicate-delivery idempotency, book-full revert, payload shape).
- Live verification: deployed bytecode on Unichain Sepolia, Base Sepolia and Lasna, with Sourcify metadata matches where supported, plus explorer-visible full-loop transactions (origin `Swap` → Lasna reactive transaction → destination callback `execute`) whose hashes are listed in the README evidence table.
