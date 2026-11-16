import { useEffect, useState } from "react";
import { LASNA_EXPLORER } from "../lib/chains";

interface Run {
  chain: string;
  chainId: number;
  orderId: number;
  swapTx: string;
  reactiveTx: string;
  callbackTx: string;
  loopMs: number;
  swapBlock: number;
  callbackBlock: number;
  note?: string;
}

interface RunsFile {
  updatedAt: string;
  runs: Run[];
}

const EMPTY: RunsFile = { updatedAt: "pending", runs: [] };

const EXPLORERS: Record<number, string> = {
  1301: "https://sepolia.uniscan.xyz",
  84532: "https://sepolia.basescan.org"
};

function txLink(chainId: number, tx: string) {
  const base = EXPLORERS[chainId] ?? "";
  return `${base}/tx/${tx}`;
}

function lasnaLink(tx: string) {
  return `${LASNA_EXPLORER}/tx/${tx}`;
}

export function Evidence() {
  const [data, setData] = useState<RunsFile>(EMPTY);
  useEffect(() => {
    fetch("/runs.json", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : EMPTY))
      .then((j) => setData(j as RunsFile))
      .catch(() => setData(EMPTY));
  }, []);
  const runs = data.runs ?? [];
  const best = runs.length ? Math.min(...runs.map((r) => r.loopMs)) : null;

  return (
    <div className="evidence">
      <div className="section-head">
        <div className="hero-badge">ON-CHAIN EVIDENCE</div>
        <h2>One loop, three transactions, zero humans.</h2>
        <p className="muted">
          Every run below is a full Tripwire loop observed end-to-end: the origin <code>Swap</code> that
          breached the trigger, the reactive transaction on Lasna that fired, and the callback that landed
          on the destination chain. Latency is the wall-clock delta from the origin swap's block to the
          callback transaction's block.
        </p>
      </div>

      <div className="evidence-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>#</th>
              <th>Chain</th>
              <th>Order</th>
              <th>Origin Swap</th>
              <th>Lasna Reactive Tx</th>
              <th>Callback Tx</th>
              <th>Loop</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td>{r.chain}</td>
                <td className="mono">#{r.orderId}</td>
                <td>
                  <a href={txLink(r.chainId, r.swapTx)} target="_blank" rel="noreferrer" className="mono link">
                    {r.swapTx.slice(0, 10)}… ↗
                  </a>
                </td>
                <td>
                  <a href={lasnaLink(r.reactiveTx)} target="_blank" rel="noreferrer" className="mono link">
                    {r.reactiveTx.slice(0, 10)}… ↗
                  </a>
                </td>
                <td>
                  <a href={txLink(r.chainId, r.callbackTx)} target="_blank" rel="noreferrer" className="mono link">
                    {r.callbackTx.slice(0, 10)}… ↗
                  </a>
                </td>
                <td className="mono accent">{(r.loopMs / 1000).toFixed(2)}s</td>
              </tr>
            ))}
            {runs.length === 0 && (
              <tr>
                <td colSpan={7} className="muted center">
                  No runs recorded yet — this table fills as soon as the first live loop completes.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {best !== null && (
        <div className="stat-strip">
          <div className="stat">
            <div className="stat-num accent">{(best / 1000).toFixed(2)}s</div>
            <div className="stat-label">fastest full loop</div>
          </div>
          <div className="stat">
            <div className="stat-num">{runs.length}</div>
            <div className="stat-label">recorded loops</div>
          </div>
          <div className="stat">
            <div className="stat-num">2</div>
            <div className="stat-label">destination chains</div>
          </div>
        </div>
      )}

      <div className="panel explainer">
        <div className="panel-title">HOW WE MEASURE</div>
        <ol className="steps">
          <li>
            The <code>scripts/measure-loop.mjs</code> script performs a small swap that moves the pool price
            across the order trigger and timestamps the origin swap block.
          </li>
          <li>It then watches Lasna for the reactive transaction that requested the callback.</li>
          <li>
            Finally it finds the callback transaction on the destination chain and computes
            <code>callbackBlockTime − swapBlockTime</code>. Script output is committed as <code>public/runs.json</code>.
          </li>
        </ol>
        <p className="muted">
          Both destination chains are watched: Unichain Sepolia (~1s blocks) and Base Sepolia (~200ms blocks,
          timestamps — never block counts — per the hackathon ground rule).
        </p>
      </div>
    </div>
  );
}
