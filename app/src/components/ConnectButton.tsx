import { useAccount, useConnect, useDisconnect } from "wagmi";

function short(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function ConnectButton() {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected && address) {
    return (
      <button className="btn btn-ghost" onClick={() => disconnect()} title="Disconnect">
        <span className="dot dot-ok" />
        {short(address)}
        <span className="muted">· {chainId === 1301 ? "Unichain Sepolia" : chainId === 84532 ? "Base Sepolia" : chainId}</span>
      </button>
    );
  }

  const injectedConnector = connectors.find((c) => c.id === "injected") ?? connectors[0];
  return (
    <button className="btn btn-primary" disabled={isPending || !injectedConnector} onClick={() => connect({ connector: injectedConnector })}>
      {isPending ? "Connecting…" : "Connect Wallet"}
    </button>
  );
}
