import { useAccount, useConnect, useDisconnect } from "wagmi";

function short(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

const CHAIN_NAMES: Record<number, string> = {
  1: "Ethereum Mainnet",
  8453: "Base",
  130: "Unichain",
  1301: "Unichain Sepolia",
  84532: "Base Sepolia",
  5318007: "Reactive Lasna",
  11155111: "Ethereum Sepolia"
};

function chainLabel(id: number | undefined) {
  if (id === undefined) return "";
  return CHAIN_NAMES[id] ?? `chain ${id}`;
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
        <span className="muted">· {chainLabel(chainId)}</span>
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
