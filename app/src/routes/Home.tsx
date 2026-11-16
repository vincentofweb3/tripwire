import { Link } from "react-router-dom";

function PriceChart() {
  return (
    <svg viewBox="0 0 560 220" className="chart" role="img" aria-label="Animated chart showing a price line falling through a dashed tripwire, triggering execution">
      <defs>
        <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ff6b1a" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#ff6b1a" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* grid */}
      {[40, 85, 130, 175].map((y) => (
        <line key={y} x1="0" y1={y} x2="560" y2={y} stroke="#232838" strokeWidth="1" />
      ))}
      {/* trigger line */}
      <line x1="0" y1="140" x2="560" y2="140" stroke="#ff6b1a" strokeWidth="1.5" strokeDasharray="6 6" className="trigger-line" />
      <text x="508" y="132" className="chart-label">TRIP</text>
      {/* price area + line */}
      <path className="price-area" d="M0,70 L60,66 L110,78 L160,64 L210,92 L260,88 L310,120 L360,132 L410,146 L460,158 L510,168 L560,176 L560,220 L0,220 Z" fill="url(#chartFill)" />
      <path className="price-line" d="M0,70 L60,66 L110,78 L160,64 L210,92 L260,88 L310,120 L360,132 L410,146 L460,158 L510,168 L560,176" fill="none" stroke="#e8eaf0" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
      {/* fire pulse at crossing */}
      <circle className="fire-dot" cx="404" cy="143" r="5" fill="#ff6b1a" />
      <circle className="fire-ring" cx="404" cy="143" r="5" fill="none" stroke="#ff6b1a" strokeWidth="2" />
      {/* annotations */}
      <g className="chart-note">
        <text x="360" y="112" className="chart-label-muted">armed, escrowed</text>
        <text x="430" y="200" className="chart-label-accent">swap fires → filled in 2.0s</text>
      </g>
    </svg>
  );
}

export function Home() {
  return (
    <div className="landing">
      {/* ── HERO ─────────────────────────────────────────────── */}
      <section className="hero-v2">
        <div>
          <div className="hero-badge">REACTIVE OMNI BUILDATHON · EVERY SECOND COUNTS</div>
          <h1 className="hero-title">
            Arm it. Walk away.<br />
            <span className="accent">Reactive executes.</span>
          </h1>
          <p className="hero-sub hero-sub-left">
            Tripwire is a keeper-less stop-loss and take-profit for Uniswap V3. One on-chain arm,
            and Reactive Omni watches the pool for you — the moment the price crosses your line, the
            fill executes itself, in about two seconds. No bots. No keys. No one watching a screen at 3 a.m.
          </p>
          <div className="hero-cta hero-cta-left">
            <Link className="btn btn-primary btn-lg" to="/trade">Open the Desk →</Link>
            <Link className="btn btn-ghost btn-lg" to="/evidence">See it run on-chain</Link>
          </div>
          <div className="hero-strip">
            <div><b>2.00s</b><span>swap → fill, both chains</span></div>
            <div><b>21</b><span>forge tests, all green</span></div>
            <div><b>0</b><span>keepers, admins or backdoors</span></div>
          </div>
        </div>
        <div className="hero-chart-wrap">
          <PriceChart />
          <div className="hero-chart-foot">
            <span className="mono">USDC / WETH · 0.3% pool · Unichain Sepolia / Base Sepolia</span>
          </div>
        </div>
      </section>

      {/* ── 01 THE PROBLEM ───────────────────────────────────── */}
      <section className="section">
        <div className="section-label">01 — THE PROBLEM</div>
        <h2 className="section-title">Stop-losses are only useful if they fire <em>before</em> the damage.</h2>
        <div className="two-col">
          <div className="prose">
            <p>
              A stop-loss order is a promise: <em>"if the price falls to X, get me out."</em> But the order
              itself can't watch the market. Something has to notice the price crossed — and today, that
              something is usually a keeper bot, a centralized service, or <em>you</em>, staring at a screen.
            </p>
            <p>
              On fast markets, minutes — even seconds — decide whether you exit at your trigger or two
              percent below it. In a real dump, a 7-second reaction window is the difference between
              "stopped out at my line" and "filled wherever the market was when my bot woke up."
            </p>
            <p>
              Worse, keeper bots hold <strong>hot keys</strong>, need <strong>uptime and infrastructure</strong>,
              and can simply <strong>be wrong, be down, or be front-run</strong>. Your risk management shouldn't
              depend on somebody's cloud instance.
            </p>
          </div>
          <div className="callout-panel">
            <div className="callout-title">Anatomy of a gap</div>
            <ol className="timeline">
              <li><b>t = 0.0s</b> — a large sell hits the pool. Price breaches your stop line.</li>
              <li><b>t = 0–1s</b> — the swap's <code>Swap</code> log lands on Unichain Sepolia / Base Sepolia (1s and 200ms blocks).</li>
              <li><b>t ≈ 1s</b> — Reactive Omni (CometBFT, instant finality) processes the log and re-checks every armed order on that pool.</li>
              <li><b>t ≈ 2s</b> — the callback executes on the destination chain: price re-read from <code>slot0()</code>, armed order filled through SwapRouter02.</li>
              <li><b>vs. a 7s world</b> — seven seconds of additional slippage you didn't choose.</li>
            </ol>
          </div>
        </div>
      </section>

      {/* ── 02 WHY REACTIVE OMNI ─────────────────────────────── */}
      <section className="section">
        <div className="section-label">02 — WHY REACTIVE OMNI</div>
        <h2 className="section-title">Seven seconds made this impossible. <em>One doesn't.</em></h2>
        <p className="section-lead">
          Reactive contracts are on-chain "if this happens there, do that here" rules. On the legacy network
          (~7s blocks), a stop-loss reaction was always a few seconds too late for the fast end of the market —
          which is exactly where stops exist. Omni's CometBFT consensus brings ~1s blocks with
          <strong> instant finality</strong>, so the full loop — origin event → match → callback → fill — lands
          in about two seconds on the chains that support it.
        </p>
        <div className="compare-table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th></th>
                <th>Keeper bot / centralized service</th>
                <th>Tripwire (Reactive Omni)</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>Keys</td><td>Hot key with trading rights, held by an operator</td><td><b>No key</b> — execution is a contract call, authorized by the delivery proxy</td></tr>
              <tr><td>Uptime</td><td>Operator's infra; DDoS, deploys, &amp; invoices apply</td><td><b>On-chain</b> — fires as long as the pool and Reactive Omni are live</td></tr>
              <tr><td>Reaction time</td><td>Polling intervals + API latency + tx inclusion</td><td><b>~2.0s measured</b>, swap block → callback block</td></tr>
              <tr><td>Failure mode</td><td>Bot misses the move, or fills late, or fills someone else first</td><td>One-shot, slippage-floored, escrow protected; cancel anytime while armed</td></tr>
              <tr><td>Trust</td><td>You trust the operator and their security posture</td><td><b>Trust the code</b> — no owner, no upgrade, no fees, auditable source</td></tr>
              <tr><td>Cost</td><td>Subscriptions / profit-sharing</td><td><b>~0</b> — pay-for-execution only (callback gas, paid from the chain reserve)</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* ── 03 HOW IT WORKS ──────────────────────────────────── */}
      <section className="section">
        <div className="section-label">03 — HOW IT WORKS</div>
        <h2 className="section-title">One arm. Three transactions. Zero humans.</h2>
        <div className="cards cards-4">
          <div className="card">
            <div className="card-num">01</div>
            <h3>Arm</h3>
            <p>Pick a pool, side, size, trigger and deadline. Your tokens are escrowed in the executor contract — a standalone, ownerless vault for that order only.</p>
          </div>
          <div className="card">
            <div className="card-num">02</div>
            <h3>Sync</h3>
            <p>The tripwire contract on Lasna sees the <code>OrderCreated</code> log and stores your trigger in its bounded on-chain order book — not in some off-chain database.</p>
          </div>
          <div className="card">
            <div className="card-num">03</div>
            <h3>Trigger</h3>
            <p>Every <code>Swap</code> log on your pool is matched against every armed order. Crossed the line? One-shot fire, straight to the destination chain.</p>
          </div>
          <div className="card">
            <div className="card-num">04</div>
            <h3>Fill</h3>
            <p>The executor re-reads <code>slot0()</code>, checks armed + deadline + crossing — then swaps via SwapRouter02. If anything's off, it skips instead of reverting your escrow.</p>
          </div>
        </div>
      </section>

      {/* ── 04 UNDER THE HOOD ────────────────────────────────── */}
      <section className="section">
        <div className="section-label">04 — UNDER THE HOOD</div>
        <h2 className="section-title">Built for the Every Second Counts brief.</h2>
        <div className="two-col">
          <div className="prose">
            <p><strong>Deliberate design decisions, all verifiable in-source:</strong></p>
            <ul className="check-list">
              <li><b>Never trust the callback.</b> The executor re-reads the pool's <code>slot0()</code> itself; a forged or replayed callback can at most fill an order that is already legitimately crossed.</li>
              <li><b>One-shot everywhere.</b> Reactive marks fired before requesting; the executor disarms before the router call. Two independent guards against double-fills.</li>
              <li><b>Timestamps, never block counts.</b> Base Sepolia produces a block every ~200ms — all deadline logic is <code>block.timestamp</code>-based.</li>
              <li><b>Bounded work.</b> Max 64 armed orders per pool on the reactive side, so <code>react()</code> stays well inside the 900k gas cap even in the worst case.</li>
              <li><b>No admin.</b> No owner, no upgrade, no pause, no fee path, no rescue. The reactive owner can only wire pools/executors — never funds.</li>
              <li><b>Fails visible.</b> A circuit breaker (full book) reverts loudly — <code>ReactiveContractReverted</code> — never silently drops your order.</li>
            </ul>
          </div>
          <div className="code-panel">
            <div className="code-panel-head"><span /><span /><span /> tripwire-loop.txt</div>
            <pre>{`origin chain (1301 | 84532)
  Uniswap V3 pool
    └─ emit Swap(amount0, amount1, sqrtPriceX96, …)
         │
         ▼
Reactive Lasna (5318007)
  TripwireReactive.react()
    ├─ decode price from the log
    ├─ match armed orders for (chain, pool)
    └─ crossed? → SYSTEM.requestCallbackV_1_0(
         chainId, executor, 500000,
         abi.encodeWithSignature("execute(address,uint256)",
                                 address(0), orderId))
         │
         ▼
destination chain
  TripwireExecutor.execute(reactive_, orderId)
    ├─ only callback proxy · injected reactive_ check
    ├─ re-read pool slot0()  ← never trusts the callback
    ├─ armed? deadline? crossing?
    └─ SwapRouter02.exactInputSingle(…, amountOutMinimum)`}</pre>
          </div>
        </div>
      </section>

      {/* ── 05 FAQ ───────────────────────────────────────────── */}
      <section className="section">
        <div className="section-label">05 — FAQ</div>
        <h2 className="section-title">Asked at every demo.</h2>
        <div className="faq">
          {[
            ["Who holds my tokens while the order is armed?", "The executor contract holds them — a standalone vault for that order only. No multi-sig, no owner key, no admin can touch them. Cancel any time while armed; you get 100% back instantly."],
            ["What does it cost to run?", "One escrow + approval at arm time, nothing per fill. The callback's destination gas comes from a small per-chain reserve we fund at deploy (and anyone can top up). Triggers themselves cost the operator nothing extra."],
            ["What if Reactive Omni or a chain goes down?", "Your order simply doesn't fire — and your escrow stays yours. Cancel whenever the chain is back (or later on mainnet). Nothing about Tripwire can strand your funds in a third party's custody."],
            ["Is this mainnet?", "No. This is the Every Second Counts buildathon submission on Unichain Sepolia and Base Sepolia with Lasna as the execution engine. Mainnet is a one-line target change away, gated on an independent audit — which this build does not claim."],
            ["What price does it trust — the callback's, or the pool's?", "Only the pool's. The executor ignores any price claims in the callback and re-reads slot0() on the destination chain inside the same transaction."],
            ["What happens if the fill would be worse than my limit?", "It doesn't happen. amountOutMinimum is enforced by the router itself; if the market moved too far, the whole callback reverts, your escrow stays intact, and you keep the order (cancel it whenever you like)."]
          ].map(([q, a]) => (
            <details key={q} className="faq-item">
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ── CTA ───────────────────────────────────────────────── */}
      <section className="final-cta">
        <div className="hero-badge">LIVE ON TWO CHAINS · 2.00s FULL LOOP</div>
        <h2 className="section-title center-title">Every second counts. <em>Make yours.</em></h2>
        <div className="hero-cta hero-cta-center">
          <Link className="btn btn-primary btn-lg" to="/trade">Arm your first order →</Link>
          <a className="btn btn-ghost btn-lg" href="https://github.com/vincentofweb3/tripwire" target="_blank" rel="noreferrer">Read the code ↗</a>
        </div>
      </section>
    </div>
  );
}
