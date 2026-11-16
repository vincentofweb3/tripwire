import { Link } from "react-router-dom";

export function Home() {
  return (
    <div className="hero">
      <div className="hero-badge">REACTIVE OMNI BUILDATHON · EVERY SECOND COUNTS</div>
      <h1 className="hero-title">
        Arm it. Walk away.
        <br />
        <span className="accent">Reactive executes.</span>
      </h1>
      <p className="hero-sub">
        Tripwire is a keeper-less stop-loss / take-profit for Uniswap V3. You arm a trigger once;
        Reactive Omni watches the pool and fills it in seconds — no bots, no keepers, no one watching a screen.
      </p>
      <div className="hero-cta">
        <Link className="btn btn-primary btn-lg" to="/trade">
          Open the Desk →
        </Link>
        <Link className="btn btn-ghost btn-lg" to="/evidence">
          See it run on-chain
        </Link>
      </div>

      <div className="cards">
        <div className="card">
          <div className="card-num">01</div>
          <h3>Arm</h3>
          <p>
            Pick a pool, sell token, size, and a trigger price. Your tokens are escrowed in the
            executor contract — no approvals floating around, no per-trade signatures.
          </p>
        </div>
        <div className="card">
          <div className="card-num">02</div>
          <h3>Trigger</h3>
          <p>
            The Tripwire reactive contract on Lasna ingests pool <code>Swap</code> logs and re-checks every
            armed order per swap. Crossed? It fires a callback — one shot, no double-fire.
          </p>
        </div>
        <div className="card">
          <div className="card-num">03</div>
          <h3>Execute</h3>
          <p>
            The per-chain callback proxy delivers <code>execute(orderId)</code>. The executor re-reads
            the pool price itself, then swaps via SwapRouter02 — proceeds straight to your recipient.
          </p>
        </div>
      </div>

      <div className="how-note">
        <strong>Why not a keeper bot?</strong> A bot notices late, gets DDoS&rsquo;d, or gets stopped.
        Tripwire&rsquo;s trigger path is fully on-chain: origin swap → Reactive Omni (CometBFT, ~1s blocks, instant
        finality) → destination callback. Every hop is an explorer-verifiable transaction — see{" "}
        <Link to="/evidence">the evidence page</Link>.
      </div>
    </div>
  );
}
