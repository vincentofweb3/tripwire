# Demo video — shot list & narration (~2:45)

Target: <3 minutes, 1080p, voiceover, no music required. Record with OBS/QuickTime/Win+G.
Do a dry run first on localhost or the live app; for the "money shot" do it on the live deployment.

**Prep before recording**
- Deployer (`0x126b…`) holds ≥5 USDC on Base Sepolia (it currently holds 5).
- A Rabby/MetaMask with USDC on Base Sepolia (yours, `0x6f90…`).
- Fresh order armed *during* the recording (steps 4–5 below) — do not pre-arm for the final take.
- Terminal font ≥ 14pt, Rabby pop-ups visible, no notifications on screen.

**Beats**

1. **0:00–0:15 — Cold open.** Screen on the landing page hero.
   > "I'm Vincent. This is Tripwire — my Every Second Counts submission for the Reactive Omni Buildathon. Tripwire is a keeper-less stop-loss and take-profit for Uniswap V3, executed by a reactive contract on Lasna."

2. **0:15–0:35 — The problem.** Scroll to section 01 (anatomy of a gap).
   > "Stop-losses depend on something noticing your price got hit. Keeper bots poll, have latency, need hot keys, and can be down exactly when the market moves."

3. **0:35–1:05 — The product.** Switch to Trade, Base Sepolia tab.
   > "Here's the desk. Live price read straight from the pool's slot0 — 0.3% USDC/WETH. I'll arm a stop-loss: sell 5 USDC for WETH if ETH falls to $40,000. That's a trigger above the current price, so it fills on the next qualifying trade."
   Click: sell USDC → WETH, amount 5, trigger 40000, condition ≤ target, slippage 5, deadline 24 → **Approve USDC** (confirm in Rabby) → **Arm tripwire** (confirm in Rabby). Order appears as ARMED.

4. **1:05–1:30 — The mechanism.** Hover the "How a fill works" panel; optionally flip to the Evidence page once.
   > "Escrow sits in the executor. The reactive contract on Lasna — a standalone CometBFT chain, ~1 second blocks, instant finality — saw my OrderCreated log and stored the trigger in its on-chain book. There's no off-chain database. When any swap crosses the line, it fires a callback to Base Sepolia."

5. **1:30–2:15 — The money shot.** Terminal + app side by side.
   > "Now the market trade — 5 USDC sold into the pool."
   Run: `node scripts/measure-loop.mjs --chain base-sepolia --side usdc --amount 5 --fee 3000 --order-id <new id>`
   Read out as it happens: swap landed → reactive tx on Lasna → callback tx on Base → **FULL LOOP: ~2 seconds**.
   Refresh the app: the order flips **ARMED → FILLED**; show WETH proceeds; click a hash → basescan `OrderExecuted`.

6. **2:15–2:45 — The receipts.** Evidence page.
   > "Both chains, full loop measured, two seconds each. Every hop is an explorer-verifiable transaction — the swap, the Lasna reactive call, the callback. 21 Foundry tests, Sourcify jobs submitted, everything open source."

7. **2:45–3:00 — Close.**
   > "No keepers. No admins. No backdoors. Arm it, walk away — Reactive executes. Repo is vincentofweb3/tripwire."

**Post-recording checklist**
- Video link public/unlisted (YouTube, Loom, or Vimeo).
- Add `/evidence` numbers to the submission text (both chains already in `runs.json`).
