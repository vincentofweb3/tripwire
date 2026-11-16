# DoraHacks submission — paste-ready text

**Project name:** Tripwire — Arm it. Walk away. Reactive executes.

**Track:** Every Second Counts

**One-liner:** Keeper-less stop-loss / take-profit for Uniswap V3 on Unichain Sepolia and Base Sepolia, executed on-chain by a Reactive Omni reactive contract — full loop measured at 2.00 seconds.

**Repository:** https://github.com/vincentofweb3/tripwire

**Contracts**

| Role | Network | Address |
| --- | --- | --- |
| TripwireReactive (order engine) | Reactive Lasna (5318007) | `0xcb581677E8C94e1aEF29033D27e57F0597C67e01` |
| TripwireExecutor | Unichain Sepolia (1301) | `0x29D685cb7574443eD28A24541Dd8FeaD4C0F4A87` |
| TripwireExecutor | Base Sepolia (84532) | `0xDE9AE68d44e41bC2b658623b16dd4c1a2f5993A0` |

**Full-loop evidence (swap → reactive tx → callback)**

Base Sepolia:
- Origin swap `0xef50b91d049b04228e6e1e98d7860b765fd4f38e9e5e779cffaa20fab1fddb6d` (block 59662966)
- Reactive (Lasna) `0x24b7b4e344e93c15190d57282635120c03b1839d1a4fd9e398919ddee1afd8a8` (block 8510219)
- Callback `0x2dee510094f6955d46ccce7af5ab9c540e87274a1fb9e9dfa4f66e3f3c053e2d` (block 59662977, `OrderExecuted`)
- **2.00s**

Unichain Sepolia:
- Origin swap `0x84b2a69bd62d1c533a04b194b5d17fb992fa107e3f0956c47c0b8c2911424416` (block 68004715)
- Reactive (Lasna) `0xd99864800b1b1e58e9145cb104733e7f8130c4d6ef589d2cdf67aa73243a85de` (block 8512738)
- Callback `0x5b57e668dc0c9c536b0afada254d5c54a689437a3c61d8e5d30383c1c71607d0` (block 68004717, `OrderExecuted`)
- **2.00s**

**What it does:** Arm a one-shot stop-loss / take-profit on a Uniswap V3 pool. The executor escrows your tokens (no keys held by anyone but you). The reactive contract on Lasna syncs a bounded on-chain order book from the executor's own `OrderCreated`/`OrderCancelled` events, watches pool `Swap` logs in ~1s, and fires a `requestCallbackV_1_0` the moment a trigger is crossed. The executor then re-reads `pool.slot0()` itself — it never trusts the callback — and fills via SwapRouter02 with a user-set `minOut` slippage floor. One-shot on both sides; cancel anytime while armed; zero admin, zero upgrade path, zero fees, zero keepers.

**Why it needs Reactive Omni:** the trigger path is fully on-chain and reaction time is the product. Measured swap→fill loop: 2.00s on both chains. Base Sepolia runs 200ms blocks — all deadline logic uses `block.timestamp`, never block counts.

**Stack:** Solidity 0.8.29, Foundry 1.9.0 (21 tests), Reactive Lasna (`@reactive/src` Omni), React + wagmi/viem, Vite, Vercel.

**Links:** App https://tripwire-alpha-three.vercel.app/ · Demo video TBD

**Notes for judges:** Sourcify verification jobs were submitted for all deployments. Honest limitations are documented in `docs/LIMITATIONS.md` — thin testnet liquidity, 64-order book cap, testnet-only.
