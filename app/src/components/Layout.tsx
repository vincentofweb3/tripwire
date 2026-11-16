import { NavLink, Outlet } from "react-router-dom";
import { ConnectButton } from "./ConnectButton";

export function Layout() {
  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            ∆
          </span>
          <span className="brand-name">TRIPWIRE</span>
          <span className="brand-sub">keeper-less stop-loss / take-profit</span>
        </div>
        <nav className="nav">
          <NavLink to="/" end>
            Overview
          </NavLink>
          <NavLink to="/trade">Trade</NavLink>
          <NavLink to="/evidence">Evidence</NavLink>
          <a href="https://github.com/vincentofweb3/tripwire" target="_blank" rel="noreferrer">
            GitHub ↗
          </a>
        </nav>
        <ConnectButton />
      </header>
      <main className="content">
        <Outlet />
      </main>
      <footer className="footer">
        <span>Built for the Reactive Omni Buildathon · Every Second Counts track</span>
        <span>
          Reactive Lasna 5318007 · <a href="https://lasna.reactscan.net" target="_blank" rel="noreferrer">reactscan ↗</a>
        </span>
      </footer>
    </div>
  );
}
