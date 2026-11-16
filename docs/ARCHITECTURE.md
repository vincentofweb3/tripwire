# Architecture

Tripwire is a keeper-less stop-loss / take-profit system for Uniswap V3 pools, executed by a Reactive Omni reactive contract. No bots, no keepers, no operators. Three moving parts:

```
Origin chain (Unichain Sepolia / Base Sepolia)     Reactive Lasna (5318007)        Destination chain (same as origin)
┌──────────────────────────────────────────┐      ┌───────────────────────────┐     ┌──────────────────────────────┐
│ Uniswap V3 pool                          │      │ TripwireReactive          │     │ TripwireExecutor             │
│  emits Swap(amount0,amount1,sqrtP,...)   │─────▶│  order book synced from   │     │  escrows seller tokens       │
│                                          │      │  executor OrderCreated/   │     │  execute() re-verifies price │
│ TripwireExecutor                          │      │  OrderCancelled events    │     │  via pool.slot0()            │
│  emits OrderCreated / OrderCancelled ─────┼─────▶│  on armed order crossed:  │────▶│  swaps via SwapRouter02      │
│                                          │      │  requestCallbackV_1_0     │     │  proceeds to recipient       │
└──────────────────────────────────────────┘      └───────────────────────────┘     └──────────────────────────────┘
```

## Why this shape

An on-chain stop-loss has two jobs: **notice the price crossed** and **execute atomically with the crossing**. A plain limit order contract cannot notice; an off-chain bot notices but can be slow, censored, or down. Tripwire puts the noticing on Reactive Omni (~1s blocks, instant finality) and the execution on the destination chain itself, with the executor re-checking everything from first principles. If Reactive Omni disappears tomorrow, armed orders can still be cancelled and refunded by their owners — there is no value-at-risk beyond the escrowed tokens and the lREACT reserves.

## Trust model

| Component | Trusts | Never trusts |
|---|---|---|
| `TripwireReactive` (Lasna) | System contract caller (`onlySystem`), its own storage | Destination chain state (it re-derives nothing; it just decodes logs) |
| `TripwireExecutor` (origin) | Its immutable `CALLBACK_PROXY` and `REACTIVE_SENDER` for authorization | The callback's claimed price — it re-reads `slot0()` on the pool |

The executor is the enforcement point. The Reactive contract is the trigger engine. Even a fully compromised reactive contract cannot execute a disarmed order, a crossed-but-expired order, or an order at any price other than what the pool itself last printed.

## Order lifecycle

1. **Create** — `executor.createOrder(...)` escrows `amountIn` of the sell token, approves the router exactly once, emits `OrderCreated`.
2. **Sync** — Lasna sees the `OrderCreated` log and stores the trigger in its bounded order book (`MAX_ORDERS_PER_POOL = 64` per chain+pool).
3. **Trigger** — on any `Swap` log on a watched pool, the reactive contract marks the one-shot order fired and requests a callback (500k gas) carrying `orderId`.
4. **Execute** — the per-chain callback proxy delivers `execute(address reactive_, uint256 orderId)`; the executor checks `msg.sender == CALLBACK_PROXY`, `reactive_ == REACTIVE_SENDER`, armed state, deadline, and `slot0()` crossing — then swaps via SwapRouter02 (`amountOutMinimum` slippage floor) to the order's recipient.
5. **Done** — proceeds paid; `OrderExecuted` emitted. Or any check fails → `OrderSkipped` emitted; the order remains escrowed and cancellable.

## Payload format (callback)

```text
execute(address reactive_, uint256 orderId)
```

The first 160 bits of the payload are replaced by the reactive contract's address by the delivery proxy; the executor authenticates that injected address against its immutable `REACTIVE_SENDER`.

## Gas & cost

- Reactive-side: `react()` is bounded by the order book cap (64 keys per chain+pool, O(n) scan of ~2100 gas per cold mapping read plus decode — well inside the 900k reactive gas cap). Each armed order costs one Lasna transaction only for the Swaps that actually cross a trigger.
- Destination-side: `execute()` is dominated by the router swap (~120–180k gas) plus escrow/state writes. Callback limit is 500k.
- Fees are never deducted to an owner; the executor has no owner and no fee mechanism.

## Base Sepolia specifics

Base Sepolia produces a block every ~200ms [VERIFIED: hackathon brief]. All deadline logic in Tripwire uses `block.timestamp` comparisons, never block counts. Lasna ~1s timestamps and destination ~200ms–1s timestamps are treated as wall-clock-equivalent for order expiry; the executor is the final arbiter.

## Bounded book & failure modes

- If a pool's book is full (64 armed orders), `react()` reverts; the reactive system contract surfaces `ReactiveContractReverted` on Lasna and the event remains unprocessed. Orders are never silently lost — they simply do not fire. Track book size via `bookOf(chainId, pool)`.
- If a callback reverts (slippage, expired, proxy reserve exhausted), Lasna logs `CallbackFailure`; the executor keeps the escrow intact; the order cannot re-fire (one-shot); the owner can `cancelOrder()` to refund.
- Duplicate log delivery is idempotent: order insert ignores existing keys; cancel marks exhausted; swap fire is guarded by `o.fired`.

## Repository layout

```
contracts/  Foundry project: src/{TripwireExecutor,TripwireReactive}.sol, test/, script/
app/        Vite + React + TypeScript + wagmi/viem frontend (evidence dashboard)
scripts/    measure-loop.mjs (full-loop latency measurement), deploy.sh
docs/       This file, SECURITY.md, LIMITATIONS.md, VERIFICATION.md
public/     Static assets
```

## Deployed addresses

See README.md — kept there so a Sourcify/explorer link is always next to the address it refers to.
