import { useState } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { isAddress } from "viem";
import type { Address } from "viem";
import { BASE_SEPOLIA_DEFAULT_EXECUTOR, UNICHAIN_SEPOLIA_DEFAULT_EXECUTOR } from "../lib/chains";
import { executorAbi } from "../lib/abi";
import { formatToken } from "../lib/orders";

const KNOWN_OLD = {
  label: "old Base Sepolia executor (pre-redeploy)",
  address: "0x78e9ffDF5ACCf1464f6b2179506F4c918C326a6A"
};

export function Recover() {
  const { address } = useAccount();
  const chainId = 84532; // this recovery targets the retired Base Sepolia executor
  const [executor, setExecutor] = useState<string>(KNOWN_OLD.address);
  const [orderId, setOrderId] = useState<string>("2");
  const [note, setNote] = useState<string | null>(null);

  const parsedId = /^\d+$/.test(orderId.trim()) ? BigInt(orderId.trim()) : undefined;
  const executorValid = isAddress(executor);

  const order = useReadContract({
    chainId,
    address: executorValid ? (executor as Address) : undefined,
    abi: executorAbi,
    functionName: "orders",
    args: parsedId !== undefined ? [parsedId] : undefined,
    query: { enabled: executorValid && parsedId !== undefined }
  });

  const cancel = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash: cancel.data });

  const o = order.data as
    | readonly [Address, Address, Address, Address, bigint, bigint, bigint, boolean, bigint, boolean]
    | undefined;

  const isOwner = o && address && o[0].toLowerCase() === address.toLowerCase();
  const armed = o ? o[9] : false;
  const isUsdcSell = o ? o[3].toLowerCase() !== "0x4200000000000000000000000000000000000006" : false;

  return (
    <div className="panel center-panel" style={{ maxWidth: 560 }}>
      <div className="panel-title">ORDER RECOVERY</div>
      <p className="muted small">
        Cancel an armed order on any executor (including retired deployments) and refund the escrowed tokens.
        You must be the order's owner, and connected on the executor's chain.
      </p>
      <label className="field">
        <span>Executor contract ({KNOWN_OLD.label}) — chain: Base Sepolia (84532)</span>
        <input value={executor} onChange={(e) => setExecutor(e.target.value)} spellCheck={false} />
      </label>
      <label className="field">
        <span>Order id</span>
        <input value={orderId} onChange={(e) => setOrderId(e.target.value)} inputMode="numeric" />
      </label>

      {o && (
        <div className="estimate">
          <div>
            <span className="muted">Owner</span> <span className="mono">{o[0].slice(0, 10)}…</span>{" "}
            {isOwner ? <span className="accent">(you)</span> : <span className="muted">(not you — cannot cancel)</span>}
          </div>
          <div>
            <span className="muted">Pool</span> <span className="mono">{o[2].slice(0, 10)}…</span>
          </div>
          <div>
            <span className="muted">Escrow</span> {formatToken(o[4], isUsdcSell ? 6 : 18, 6)}{" "}
            {isUsdcSell ? "USDC" : "WETH"}
          </div>
          <div>
            <span className="muted">Status</span> {armed ? "ARMED — cancellable" : "not armed (filled/cancelled)"}
          </div>
        </div>
      )}
      {order.isLoading && <p className="muted small">Loading order…</p>}
      {order.error && <p className="error">Could not read the order: {String(order.error).slice(0, 140)}</p>}

      <button
        className="btn btn-primary"
        disabled={!isOwner || !armed || cancel.isPending || receipt.isLoading}
        onClick={() => {
          setNote(null);
          cancel.writeContract({
            chainId,
            address: executor as Address,
            abi: executorAbi,
            functionName: "cancelOrder",
            args: [parsedId!]
          });
        }}
      >
        {receipt.isLoading ? "Waiting for confirmation…" : receipt.isSuccess ? "Refunded ✓" : "Cancel & refund"}
      </button>
      {cancel.error && <div className="error">{String(cancel.error).slice(0, 200)}</div>}
      {note && <div className="muted small">{note}</div>}

      <p className="muted small" style={{ marginTop: 16 }}>
        Reference — Unichain Sepolia executor: <span className="mono">{UNICHAIN_SEPOLIA_DEFAULT_EXECUTOR}</span> ·
        Base Sepolia executor: <span className="mono">{BASE_SEPOLIA_DEFAULT_EXECUTOR}</span>
      </p>
    </div>
  );
}
