import { useEffect, useMemo, useState } from "react";
import {
  useAccount,
  useChainId,
  useReadContract,
  useReadContracts,
  useWriteContract,
  useWaitForTransactionReceipt,
  usePublicClient,
  useSwitchChain
} from "wagmi";
import type { Address } from "viem";

const ORDER_EXECUTED_EVENT = parseAbiItem(
  "event OrderExecuted(uint256 indexed orderId, address indexed owner, uint160 sqrtPriceX96, uint256 amountOut)"
);
import { parseAbiItem } from "viem";
import { CHAINS, SUPPORTED_CHAIN_IDS } from "../lib/chains";
import { executorAbi, poolAbi, erc20Abi } from "../lib/abi";
import {
  usdcPerEth,
  triggerFromTarget,
  parseToken,
  formatToken,
  formatUsdcPerEth,
  type PriceCondition
} from "../lib/orders";

export function Trade() {
  const { address } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending: switching } = useSwitchChain();
  const cfg = CHAINS[chainId];
  const client = usePublicClient();

  const [poolIdx, setPoolIdx] = useState(1);
  const [sellWeth, setSellWeth] = useState(true);
  const [amount, setAmount] = useState("0.01");
  const [target, setTarget] = useState("40000");
  const [condition, setCondition] = useState<PriceCondition>("lte");
  const [slippage, setSlippage] = useState("2");
  const [deadlineHours, setDeadlineHours] = useState("24");
  const [error, setError] = useState<string | null>(null);
  const [fills, setFills] = useState<Record<string, bigint>>({});

  const pool = cfg?.pools[poolIdx];
  const sellToken = sellWeth ? cfg?.weth : cfg?.usdc;
  const sellDecimals = sellWeth ? 18 : 6;

  const slot0 = useReadContract({
    chainId,
    address: pool?.address,
    abi: poolAbi,
    functionName: "slot0",
    query: { enabled: !!cfg && SUPPORTED_CHAIN_IDS.includes(chainId as 1301 | 84532), refetchInterval: 4000 }
  });
  const sqrtP = slot0.data?.[0];
  const live = sqrtP !== undefined ? usdcPerEth(sqrtP) : undefined;

  const poolSlots = useReadContracts({
    contracts: (cfg?.pools ?? []).map((p) => ({
      chainId,
      address: p.address,
      abi: poolAbi,
      functionName: "slot0" as const
    })),
    query: { enabled: !!cfg && SUPPORTED_CHAIN_IDS.includes(chainId as 1301 | 84532), refetchInterval: 4000 }
  });
  const poolPrices = poolSlots.data?.map((r) =>
    r.status === "success" && r.result ? usdcPerEth((r.result as unknown as readonly [bigint, ...unknown[]])[0]) : undefined
  );

  const balanceSell = useReadContract({
    chainId,
    address: sellToken,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!sellToken, refetchInterval: 5000 }
  });

  const allowance = useReadContract({
    chainId,
    address: sellToken,
    abi: erc20Abi,
    functionName: "allowance",
    args: address && cfg?.executor ? [address, cfg.executor] : undefined,
    query: { enabled: !!address && !!cfg?.executor && !!sellToken }
  });

  const parsed = useMemo(() => {
    try {
      const amountIn = parseToken(amount || "0", sellDecimals);
      const targetNum = Number(target);
      if (!(targetNum > 0)) return null;
      const { trigger, fireAbove } = triggerFromTarget(targetNum, condition);
      const fee = pool?.fee === 500 ? 0.0005 : 0.003;
      const slip = Number(slippage) / 100;
      if (!(slip >= 0 && slip < 1)) return null;
      let expectedOut = 0;
      const amt = Number(amount);
      if (live) {
        expectedOut = sellWeth ? amt * live * (1 - fee) : (amt / live) * (1 - fee);
      }
      const minOutNum = expectedOut * (1 - slip);
      const minOutDecimals = sellWeth ? 6 : 18;
      const minOut = parseToken(minOutNum > 0 ? minOutNum.toFixed(minOutDecimals) : "0", minOutDecimals);
      const deadline = BigInt(Math.floor(Date.now() / 1000) + Number(deadlineHours) * 3600);
      return { amountIn, trigger, fireAbove, minOut, deadline, expectedOut };
    } catch {
      return null;
    }
  }, [amount, target, condition, slippage, deadlineHours, sellWeth, sellDecimals, pool?.fee, live]);

  const needsApproval = parsed && allowance.data !== undefined && allowance.data < parsed.amountIn;

  const approve = useWriteContract();
  const create = useWriteContract();
  const cancel = useWriteContract();
  const approveReceipt = useWaitForTransactionReceipt({ hash: approve.data });
  const createReceipt = useWaitForTransactionReceipt({ hash: create.data });
  const cancelReceipt = useWaitForTransactionReceipt({ hash: cancel.data });

  useEffect(() => {
    if (createReceipt.isSuccess) allowance.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createReceipt.isSuccess]);

  useEffect(() => {
    if (approveReceipt.isSuccess) allowance.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approveReceipt.isSuccess]);

  const orderIds = useReadContract({
    chainId,
    address: cfg?.executor,
    abi: executorAbi,
    functionName: "ordersOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!cfg?.executor, refetchInterval: 6000 }
  });

  const idList = (orderIds.data as bigint[] | undefined) ?? [];
  const orderReads = useReadContracts({
    contracts: idList.map((id) => ({
      chainId,
      address: cfg?.executor as Address,
      abi: executorAbi,
      functionName: "orders" as const,
      args: [id] as const
    })),
    query: { enabled: idList.length > 0 && !!cfg?.executor }
  });

  useEffect(() => {
    if (!client || !cfg?.executor || !address || idList.length === 0) return;

    const cacheKey = `tripwire:fills:${chainId}:${cfg.executor}:${address.toLowerCase()}`;
    let cancelled = false;

    const readCache = (): Record<string, bigint> => {
      try {
        const raw = localStorage.getItem(cacheKey);
        if (!raw) return {};
        const parsed = JSON.parse(raw) as { t: number; fills: Record<string, string> };
        if (Date.now() - parsed.t > 5 * 60 * 1000) return {};
        return Object.fromEntries(Object.entries(parsed.fills).map(([k, v]) => [k, BigInt(v)]));
      } catch {
        return {};
      }
    };

    const writeCache = (map: Record<string, bigint>) => {
      try {
        const fills = Object.fromEntries(Object.entries(map).map(([k, v]) => [k, v.toString()]));
        localStorage.setItem(cacheKey, JSON.stringify({ t: Date.now(), fills }));
      } catch {
        /* storage full / private mode — non-fatal */
      }
    };

    const cached = readCache();
    if (Object.keys(cached).length > 0) {
      setFills(cached);
      return;
    }

    (async () => {
      const PAGE = 190n;
      const map: Record<string, bigint> = {};
      try {
        const latest = await client.getBlockNumber();
        const from = cfg.scanFrom;
        if (from > latest) return;
        const ranges: { fromBlock: bigint; toBlock: bigint }[] = [];
        for (let lo = from; lo <= latest; lo += PAGE) {
          const hi = lo + PAGE - 1n > latest ? latest : lo + PAGE - 1n;
          ranges.push({ fromBlock: lo, toBlock: hi });
        }
        // fetch in parallel batches of 8
        for (let i = 0; i < ranges.length; i += 8) {
          if (cancelled) return;
          const batch = await Promise.all(
            ranges.slice(i, i + 8).map((r) =>
              client
                .getLogs({ address: cfg.executor!, event: ORDER_EXECUTED_EVENT, args: { owner: address }, ...r })
                .catch(() => [] as never[])
            )
          );
          for (const logs of batch) {
            for (const log of logs as unknown as { args: { orderId: bigint; amountOut: bigint } }[]) {
              map[log.args.orderId.toString()] = log.args.amountOut;
            }
          }
        }
        if (!cancelled) {
          setFills(map);
          writeCache(map);
        }
      } catch {
        if (!cancelled) setFills({});
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [client, cfg?.executor, cfg?.scanFrom, address, idList.length, chainId]);

  if (!SUPPORTED_CHAIN_IDS.includes(chainId as 1301 | 84532) || !cfg || !pool || !sellToken) {
    return (
      <div className="panel center-panel">
        <h2>Wrong network — your wallet is on chain {chainId}</h2>
        <p className="muted">Tripwire executes on Unichain Sepolia and Base Sepolia. Switch with one click:</p>
        <div className="hero-cta">
          <button className="btn btn-primary btn-lg" disabled={switching} onClick={() => switchChain({ chainId: 1301 })}>
            Unichain Sepolia
          </button>
          <button className="btn btn-primary btn-lg" disabled={switching} onClick={() => switchChain({ chainId: 84532 })}>
            Base Sepolia
          </button>
        </div>
      </div>
    );
  }

  const executorReady = !!cfg.executor;

  const onApprove = () => {
    setError(null);
    if (!parsed || !cfg.executor) return;
    approve.writeContract({
      chainId,
      address: sellToken,
      abi: erc20Abi,
      functionName: "approve",
      args: [cfg.executor, parsed.amountIn]
    });
  };

  const onCreate = () => {
    setError(null);
    if (!parsed || !cfg.executor || !address) return;
    if (balanceSell.data !== undefined && parsed.amountIn > balanceSell.data) {
      setError("Insufficient balance of the sell token.");
      return;
    }
    create.writeContract({
      chainId,
      address: cfg.executor,
      abi: executorAbi,
      functionName: "createOrder",
      args: [
        pool.address,
        sellToken,
        parsed.amountIn,
        parsed.minOut,
        parsed.trigger,
        parsed.fireAbove,
        parsed.deadline,
        address
      ]
    });
  };

  const expired = (dl: bigint) => Number(dl) * 1000 < Date.now();

  return (
    <div className="desk">
      {!executorReady && (
        <div className="banner">Executor addresses are not configured for this build — set VITE_EXECUTOR_* env vars.</div>
      )}
      <div className="desk-col">
        <div className="panel">
          <div className="panel-title">MARKET</div>
          <div className="row-between">
            <div className="muted">{cfg.chain.name}</div>
            <div className="chain-pill">chain {chainId}</div>
          </div>
          <div className="pool-tabs">
            {cfg.pools.map((p, i) => (
              <button key={p.address} className={`pool-tab${i === poolIdx ? " active" : ""}`} onClick={() => setPoolIdx(i)}>
                <span>{p.label}</span>
                <span className="pool-tab-price">{poolPrices?.[i] !== undefined ? formatUsdcPerEth(poolPrices[i]!) : "—"}</span>
              </button>
            ))}
          </div>
          <div className="price-big">{live !== undefined ? formatUsdcPerEth(live) : "—"}</div>
          <div className="price-sub">USDC per WETH · live from pool slot0 · {pool.address.slice(0, 8)}…</div>
          {address && balanceSell.data !== undefined && (
            <div className="muted small">
              Balance: {formatToken(balanceSell.data as bigint, sellDecimals, 6)} {sellWeth ? "WETH" : "USDC"}
            </div>
          )}
        </div>

        <div className="panel">
          <div className="panel-title">1 · CREATE AN ORDER</div>
          <div className="side-tabs">
            <button className={`side-tab${sellWeth ? " active" : ""}`} onClick={() => setSellWeth(true)}>
              Sell WETH → USDC
            </button>
            <button className={`side-tab${!sellWeth ? " active" : ""}`} onClick={() => setSellWeth(false)}>
              Sell USDC → WETH
            </button>
          </div>
          <label className="field">
            <span>Amount ({sellWeth ? "WETH" : "USDC"})</span>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0.01" />
          </label>
          <label className="field">
            <span>Trigger: ETH price in USDC</span>
            <input value={target} onChange={(e) => setTarget(e.target.value)} inputMode="decimal" placeholder="40000" />
          </label>
          <div className="cond-tabs">
            <button className={`cond-tab${condition === "lte" ? " active" : ""}`} onClick={() => setCondition("lte")}>
              ≤ target <span className="muted">(stop-loss)</span>
            </button>
            <button className={`cond-tab${condition === "gte" ? " active" : ""}`} onClick={() => setCondition("gte")}>
              ≥ target <span className="muted">(take-profit)</span>
            </button>
          </div>
          <div className="grid-2">
            <label className="field">
              <span>Slippage %</span>
              <input value={slippage} onChange={(e) => setSlippage(e.target.value)} inputMode="decimal" />
            </label>
            <label className="field">
              <span>Deadline (hours)</span>
              <input value={deadlineHours} onChange={(e) => setDeadlineHours(e.target.value)} inputMode="numeric" />
            </label>
          </div>
          {parsed && (
            <div className="estimate">
              <div>
                <span className="muted">Expected out</span> {parsed.expectedOut.toFixed(6)} {sellWeth ? "USDC" : "WETH"}
              </div>
              <div>
                <span className="muted">Min received</span> {formatToken(parsed.minOut, sellWeth ? 6 : 18, 6)}{" "}
                {sellWeth ? "USDC" : "WETH"}
              </div>
              <div>
                <span className="muted">Fires when</span> ETH {condition === "lte" ? "falls to ≤" : "rises to ≥"} ${target}
              </div>
            </div>
          )}
          {error && <div className="error">{error}</div>}
          {!address ? (
            <p className="muted">Connect your wallet to arm an order.</p>
          ) : needsApproval ? (
            <button className="btn btn-primary" onClick={onApprove} disabled={approve.isPending || !parsed}>
              {approve.isPending ? "Approving…" : `1 · Approve ${sellWeth ? "WETH" : "USDC"}`}
            </button>
          ) : (
            <button className="btn btn-primary" onClick={onCreate} disabled={create.isPending || !parsed || !executorReady}>
              {create.isPending ? "Arming…" : "2 · Arm tripwire"}
            </button>
          )}
          {(approve.error || create.error) && <div className="error">{String(approve.error ?? create.error).slice(0, 200)}</div>}
        </div>
      </div>

      <div className="desk-col">
        <div className="panel grow">
          <div className="panel-title">YOUR ORDERS</div>
          {!address && <p className="muted">Connect wallet to see your orders.</p>}
          {address && idList.length === 0 && <p className="muted">No orders yet. Arm your first tripwire.</p>}
          <div className="orders">
            {orderReads.data?.map((res, i) => {
              if (res.status !== "success") return null;
              const o = res.result as unknown as readonly [
                Address, Address, Address, Address, bigint, bigint, bigint, boolean, bigint, boolean
              ];
              const [, , , , amountIn, , trigger, fireAbove, deadline, armed] = o;
              const id = idList[i]?.toString();
              const triggerUsdc = usdcPerEth(trigger);
              const isUsdcSell = o[3].toLowerCase() === cfg.usdc.toLowerCase();
              const fillDecimals = isUsdcSell ? 18 : 6;
              const doneFillRaw = fills[id];
              const doneFill = doneFillRaw !== undefined ? `${formatToken(doneFillRaw, fillDecimals, 6)} ${isUsdcSell ? "WETH" : "USDC"}` : undefined;
              const isExpired = expired(deadline);
              return (
                <div className="order" key={id}>
                  <div className="order-head">
                    <span className="mono">#{id}</span>
                    <span className={`badge ${armed ? (isExpired ? "badge-warn" : "badge-armed") : "badge-closed"}`}>
                      {armed ? (isExpired ? "EXPIRED" : "ARMED") : doneFill ? "FILLED" : "CLOSED"}
                    </span>
                  </div>
                  <div className="order-body">
                    <div className="muted small">
                      Trigger: ETH {fireAbove ? "≤" : "≥"} {formatUsdcPerEth(triggerUsdc)}
                    </div>
                    <div className="muted small">
                      Size: {formatToken(amountIn, isUsdcSell ? 6 : 18, 6)} {isUsdcSell ? "USDC" : "WETH"}
                    </div>
                    <div className="muted small">Deadline: {new Date(Number(deadline) * 1000).toLocaleString()}</div>
                    {doneFill && <div className="fill mono">Filled → {doneFill}</div>}
                  </div>
                  {armed && (
                    <button className="btn btn-ghost btn-sm" onClick={() => cfg.executor && cancel.writeContract({ chainId, address: cfg.executor, abi: executorAbi, functionName: "cancelOrder", args: [BigInt(id)] })}>
                      {cancel.isPending ? "Cancelling…" : "Cancel & refund"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {(cancel.error || cancelReceipt.isLoading) && cancel.error && (
            <div className="error">{String(cancel.error).slice(0, 200)}</div>
          )}
        </div>

        <div className="panel hint-panel">
          <div className="panel-title">HOW A FILL WORKS</div>
          <ol className="steps">
            <li>Swap trade moves the pool price past your trigger.</li>
            <li>Lasna sees the log in ~1s and fires a callback carrying your order id.</li>
            <li>The executor re-reads slot0, checks armed/deadline, and swaps.</li>
          </ol>
          <p className="muted small">
            Gas budget for one fill is paid by the order's chain callback reserve. Escrowed tokens always stay
            yours until a fill lands — cancel any time to get them back.
          </p>
        </div>
      </div>
    </div>
  );
}
