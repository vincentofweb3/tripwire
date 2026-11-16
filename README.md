# Tripwire

**Arm it. Walk away. Reactive executes.**

Keeper-less stop-loss / take-profit for Uniswap V3 on Unichain Sepolia and Base Sepolia, executed by a Reactive Omni reactive contract on Lasna. No bots. No keepers. No one watching a screen.

Built for the [Reactive Omni Buildathon](https://dorahacks.io/hackathon/reactive-omni-buildathon) — **Every Second Counts** track. Open source, MIT license.

## Live evidence

| Item | Value |
| --- | --- |
| Public repo | https://github.com/vincentofweb3/tripwire |
| Reactive contract (Lasna 5318007) | [`0xcb581677E8C94e1aEF29033D27e57F0597C67e01`](https://lasna.reactscan.net/address/0xcb581677E8C94e1aEF29033D27e57F0597C67e01) (deploy tx [`0x6f7de1728075ac8e53fea23abef0a54ab6e60caaae5ed776c09f1b36118a9ea9`](https://lasna.reactscan.net/tx/0x6f7de1728075ac8e53fea23abef0a54ab6e60caaae5ed776c09f1b36118a9ea9)) |
| Executor (Unichain Sepolia) | [`0x29D685cb7574443eD28A24541Dd8FeaD4C0F4A87`](https://sepolia.uniscan.xyz/address/0x29D685cb7574443eD28A24541Dd8FeaD4C0F4A87) (deploy tx [`0x1c05885782bd7641dd55de42ec352f2240cc909f55925fdaf4480d3c0b437c38`](https://sepolia.uniscan.xyz/tx/0x1c05885782bd7641dd55de42ec352f2240cc909f55925fdaf4480d3c0b437c38)) |
| Executor (Base Sepolia) | [`0xDE9AE68d44e41bC2b658623b16dd4c1a2f5993A0`](https://sepolia.basescan.org/address/0xDE9AE68d44e41bC2b658623b16dd4c1a2f5993A0) (deploy tx [`0xf3c7d345359283295e002381091c51f89ffa11a103c1e2c807d7188ff9cc1270`](https://sepolia.basescan.org/tx/0xf3c7d345359283295e002381091c51f89ffa11a103c1e2c807d7188ff9cc1270)) |
| Contract tests | 21 passed, 0 failed (`forge test`, Foundry 1.9.0) |
| App | TBD-vercel |

### Full loop, measured on both chains

| Chain | Origin swap | Lasna reactive tx | Destination callback | Loop |
| --- | --- | --- | --- | --- |
| Base Sepolia (0.3% pool) | [`0xef50b91d049b04228e6e1e98d7860b765fd4f38e9e5e779cffaa20fab1fddb6d`](https://sepolia.basescan.org/tx/0xef50b91d049b04228e6e1e98d7860b765fd4f38e9e5e779cffaa20fab1fddb6d) (block 59662966) | [`0x24b7b4e344e93c15190d57282635120c03b1839d1a4fd9e398919ddee1afd8a8`](https://lasna.reactscan.net/tx/0x24b7b4e344e93c15190d57282635120c03b1839d1a4fd9e398919ddee1afd8a8) (block 8510219) | [`0x2dee510094f6955d46ccce7af5ab9c540e87274a1fb9e9dfa4f66e3f3c053e2d`](https://sepolia.basescan.org/tx/0x2dee510094f6955d46ccce7af5ab9c540e87274a1fb9e9dfa4f66e3f3c053e2d) (block 59662977, `OrderExecuted`) | **2.00s** |
| Unichain Sepolia (0.3% pool) | [`0x84b2a69bd62d1c533a04b194b5d17fb992fa107e3f0956c47c0b8c2911424416`](https://sepolia.uniscan.xyz/tx/0x84b2a69bd62d1c533a04b194b5d17fb992fa107e3f0956c47c0b8c2911424416) (block 68004715) | [`0xd99864800b1b1e58e9145cb104733e7f8130c4d6ef589d2cdf67aa73243a85de`](https://lasna.reactscan.net/tx/0xd99864800b1b1e58e9145cb104733e7f8130c4d6ef589d2cdf67aa73243a85de) (block 8512738) | [`0x5b57e668dc0c9c536b0afada254d5c54a689437a3c61d8e5d30383c1c71607d0`](https://sepolia.uniscan.xyz/tx/0x5b57e668dc0c9c536b0afada254d5c54a689437a3c61d8e5d30383c1c71607d0) (block 68004717, `OrderExecuted`) | **2.00s** |

Both fills executed `OrderExecuted` in the callback transaction and left the escrow fully drained to the orders' recipient (`amountOut` above each pool's `minOut` floor). Latency here is the wall-clock delta between the origin swap's block timestamp and the callback transaction's block timestamp — measured by `scripts/measure-loop.mjs` and recorded in `app/public/runs.json`.

## What it is

You arm a one-shot order once: pool, sell token, size, trigger price, deadline. Your tokens are escrowed in the executor. From that moment, nobody needs to press a button.

1. A trade moves the pool past your trigger.
2. The tripwire reactive contract on Lasna sees the `Swap` log (~1s blocks, instant finality), re-checks every armed order for that pool, and marks yours fired.
3. The per-chain callback proxy delivers `execute(orderId)` to the executor on the destination chain.
4. The executor re-reads `pool.slot0()` itself — it never trusts the callback's word — verifies armed/deadline/crossing, and swaps via SwapRouter02. Proceeds land at your recipient.

If anything looks off at step 4 (expired, disarmed, not crossed), the order is skipped, not reverted — and you can always `cancelOrder()` to get your escrow back while it's armed.

## Why not a keeper bot?

A keeper bot notices late, needs hosting, needs keys, and gets turned off. Tripwire's entire trigger path is on-chain: **origin `Swap` → Reactive Omni → destination callback**. Every hop is an explorer-verifiable transaction — see the evidence table and `/evidence` in the app.

## Networks and addresses

| Layer | Network | Chain ID | Role |
| --- | --- | --- | --- |
| Origin + destination | Unichain Sepolia | 1301 | watched USDC/WETH pools; executor escrow + fills |
| Origin + destination | Base Sepolia | 84532 | watched USDC/WETH pools; executor escrow + fills |
| Execution engine | Reactive Lasna | 5318007 | `TripwireReactive`: order book sync + triggers |
| Delivery proxy | Unichain Sepolia | 1301 | `0x775c9B990ADe401060B78D0e98684eEf8d2466C1` |
| Delivery proxy | Base Sepolia | 84532 | `0x476F44b11F5C942c58f4c8E3d0300E5710743585` |

Watched pools (USDC/WETH), verified live via `factories.getPool`:

| Chain | 0.05% | 0.3% |
| --- | --- | --- |
| Unichain Sepolia | `0xBeAD5792bB6C299AB11Eaa425aC3fE11ebA47b3B` | `0x8F463126bBEA80A10DF9Bf6FF5455B6B0292B34e` |
| Base Sepolia | `0x94bfc0574FF48E92cE43d495376C477B1d0EEeC0` | `0x46880b404CD35c165EDdefF7421019F8dD25F4Ad` |

Test tokens: USDC `0x31d0220469e10c4e71834a79b1f276d740d3768f` (Unichain), USDC `0x036CbD53842c5426634e7929541eC2318f3dCF7e` (Base), both 6dp (Circle test USDC from [faucet.circle.com](https://faucet.circle.com/)); WETH `0x4200000000000000000000000000000000000006` both chains.

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Security model: [docs/SECURITY.md](docs/SECURITY.md). Honest limits: [docs/LIMITATIONS.md](docs/LIMITATIONS.md).

```
Uniswap V3 pool (origin) ──Swap──▶ TripwireReactive (Lasna)
                                      │ armed order crossed? one-shot
                                      ▼ requestCallbackV_1_0 (500k gas)
              TripwireExecutor.execute(reactive_, orderId)
                only callback proxy · injected reactive_ must match
                re-reads slot0() · armed + deadline + crossing checked
                swaps via SwapRouter02 · proceeds → recipient
```

Base Sepolia ground rule: **all deadlines are `block.timestamp`-based, never block counts** (200ms blocks).

## Run locally

### Contracts

```bash
git clone https://github.com/vincentofweb3/tripwire.git
cd tripwire/contracts
git submodule update --init --recursive
arcf="$(command -v forge || command -v forge)"; $arcf test -vv
```

### App

```bash
cd app
npm install
cp .env.example .env   # fill VITE_EXECUTOR_UNICHAIN_SEPOLIA / VITE_EXECUTOR_BASE_SEPOLIA
npm run dev
```

### Measurement

```bash
cd scripts
npm install
TRIPWIRE_PK=0x... REACTIVE_CONTRACT=0x... VITE_EXECUTOR_BASE_SEPOLIA=0x... \
  node measure-loop.mjs --chain base-sepolia --side weth --amount 0.01 --order-id <id>
```

## Repository layout

```text
contracts/   Foundry project (TripwireExecutor, TripwireReactive, 21 tests)
app/         Vite + React + TS + wagmi/viem app (create/cancel orders, evidence page)
scripts/     measure-loop.mjs (full-loop latency), deploy.sh, deploy-testnet*.sh
docs/        ARCHITECTURE.md, SECURITY.md, LIMITATIONS.md, VERIFICATION.md
```

## Design notes

- **The executor never trusts the callback.** Price, armed state and deadline are all re-read on the destination chain in the same transaction as the swap.
- **One-shot everywhere.** The reactive side marks fired before requesting; the executor disarms before the router call; two independent guards against double-fill.
- **Bounded work.** Max 64 armed orders per chain+pool on the reactive side; `react()` stays well inside the 900k gas cap.
- **No admin.** No owner, no upgrade, no pause, no fee, no rescue. The reactive contract's owner can only wire pools and executors (executors are set once per chain) and never touches funds.
- **Base Sepolia rule honored.** Timestamps everywhere; no block-count logic.
- **Reactive debt kills subscriptions — we learnt this the hard way in flight.** Lasna deactivates a reactive contract's subscriptions when its lREACT balance can't cover the execution fee (visible as `"Active": false` in `rnk_getFilters`). `TripwireReactive` therefore exposes `coverDebt()` so anyone can settle its debt and revive it; endow it with enough lREACT for the expected call volume. This is the single most important operational note for running Tripwire (and we endow it with 1 lREACT at deploy).

## License

MIT. Copyright (c) 2026 vincentofweb3.
