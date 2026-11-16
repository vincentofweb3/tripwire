# Limitations

Tripwire is a focused demonstration of Reactive Omni's full-loop speed for the "Every Second Counts" track. Honest boundaries:

**Scope**

- Two pools per chain are watched by default (USDC/WETH 0.3% and 0.05%); extending to more pools is one `addPool` owner call on Lasna, but each extra subscription spends lREACT on every matching Swap it processes.
- Orders are one-shot, all-or-nothing, single-pool, ERC-20 ↔ ERC-20. No partial fills, no DCA, no range orders, no LP-position logic (e.g. no automatic "remove liquidity when out of range" — that is a genuinely good next milestone, not claimed here).
- Sell side only; no buying on dip (mirror of the same design, just symmetric triggers).
- Deadline is enforced on execution; an order left to expire stays escrowed and is reclaimed via `cancelOrder`. It never auto-refunds.

**Technical**

- Execution quality is bounded by the pool's actual liquidity at fill time; testnet pools are thin, so observed fills are tiny and `minOut` must be generous. This is inherent to testnet DeFi, not to the architecture.
- Base Sepolia's 200ms blocks make block-count deadlines meaningless — all Tripwire timing is `block.timestamp`-based, per the event's ground rule.
- Timestamps on Lasna and destination chains are wall-clock-equivalent but not synchronized; an order may fire on a swap whose block timestamp is a few hundred milliseconds ahead of Lasna's view.
- The callback gas budget (500k) covers SwapRouter02 for a common-case single-hop v3 swap; exotic router paths (custom fee-on-transfer handling) are not supported.
- The reactive order book is capped at 64 armed keys per chain+pool; a full book surfaces a visible revert instead of silent failure.

**Non-goals (explicitly)**

- No mainnet deployment as part of this submission.
- No audit; no insurance of any kind; testnet use only.
- No MEV protection beyond `minOut`; no private mempool (testnet pools have no searchers worth the name).
- No portfolio rebalancing, no cross-chain arbitrage — the deliberate scope is "one armed, one-shot, verifiable trigger".
- No AI anywhere in the loop; Tripwire is in the "Every Second Counts" track.

**Roadmap**

1. LP-position guardian: out-of-range → auto-remove and re-range via the same armed-order pattern.
2. Symmetric buy-side orders (dip entries).
3. Multi-pool orders with "fill on the best price" routing.
4. Mainnet deployment behind an independent review + bug bounty, if demand exists.
