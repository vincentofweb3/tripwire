// Measures a full Tripwire loop: origin swap -> Lasna reactive tx -> destination callback.
//
// Usage:
//   TRIPWIRE_PK=0x<deployer-key> node scripts/measure-loop.mjs \
//     --chain unichain-sepolia --side weth --amount 0.01 --order-id 1
//   node scripts/measure-loop.mjs --chain base-sepolia --side weth --amount 0.01 --order-id 1
//
// Prerequisite: an ARMED order whose trigger sits between the pre-swap price and the
// post-swap price. The script executes the swap, watches Lasna for the TripwireFired
// event, then watches the destination chain for the OrderExecuted callback, and computes
// loop latency from block timestamps. Appends a record to app/public/runs.json.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  formatEther,
  parseAbiItem,
  encodeFunctionData
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const RUNS_JSON = path.join(ROOT, "app", "public", "runs.json");

const CHAINS = {
  "unichain-sepolia": {
    id: 1301,
    name: "Unichain Sepolia",
    rpc: process.env.UNICHAIN_SEPOLIA_RPC ?? "https://sepolia.unichain.org",
    explorer: "https://sepolia.uniscan.xyz",
    usdc: "0x31d0220469e10c4e71834a79b1f276d740d3768f",
    weth: "0x4200000000000000000000000000000000000006",
    pools: { 500: "0xBeAD5792bB6C299AB11Eaa425aC3fE11ebA47b3B", 3000: "0x8F463126bBEA80A10DF9Bf6FF5455B6B0292B34e" },
    router: "0xd1AAE39293221B77B0C71fBD6dCb7Ea29Bb5B166", // SwapRouter02
    fee: 3000,
    executor: process.env.VITE_EXECUTOR_UNICHAIN_SEPOLIA ?? "0x29D685cb7574443eD28A24541Dd8FeaD4C0F4A87"
  },
  "base-sepolia": {
    id: 84532,
    name: "Base Sepolia",
    rpc: process.env.BASE_SEPOLIA_RPC ?? "https://sepolia.base.org",
    explorer: "https://sepolia.basescan.org",
    usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    weth: "0x4200000000000000000000000000000000000006",
    pools: { 500: "0x94bfc0574FF48E92cE43d495376C477B1d0EEeC0", 3000: "0x46880b404CD35c165EDdefF7421019F8dD25F4Ad" },
    router: "0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4", // SwapRouter02
    fee: 3000,
    executor: process.env.VITE_EXECUTOR_BASE_SEPOLIA ?? "0xDE9AE68d44e41bC2b658623b16dd4c1a2f5993A0"
  }
};
const LASNA_RPC = process.env.LASNA_RPC ?? "https://lasna-rpc.rnk.dev";
const REACTIVE = process.env.REACTIVE_CONTRACT ?? "0xcb581677E8C94e1aEF29033D27e57F0597C67e01"; // TripwireReactive v2 on Lasna
const ORDER_EXECUTED = parseAbiItem(
  "event OrderExecuted(uint256 indexed orderId, address indexed owner, uint160 sqrtPriceX96, uint256 amountOut)"
);

const routerAbi = [
  {
    type: "function",
    name: "exactInputSingle",
    stateMutability: "payable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "recipient", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "amountOutMinimum", type: "uint256" },
          { name: "sqrtPriceLimitX96", type: "uint160" }
        ]
      }
    ],
    outputs: [{ name: "amountOut", type: "uint256" }]
  }
];
const erc20Abi = [
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ name: "", type: "uint256" }] }
];

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withRetry(fn, tries = 6, delayMs = 2000) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      await sleep(delayMs);
    }
  }
  throw lastErr;
}

async function main() {
  const chainKey = arg("chain", "unichain-sepolia");
  const cfg = CHAINS[chainKey];
  const side = arg("side", "weth"); // 'weth' (sell WETH) or 'usdc'
  const feeTier = Number(arg("fee", "500"));
  if (!cfg.pools[feeTier]) throw new Error(`--fee must be one of ${Object.keys(cfg.pools).join(", ")}`);
  const pool = cfg.pools[feeTier];
  const orderId = BigInt(arg("order-id", "1"));
  const skipSwap = process.argv.includes("--skip-swap");

  if (!REACTIVE) throw new Error("Set REACTIVE_CONTRACT=<lasna-reactive-address>");
  if (!cfg.executor) throw new Error(`Set VITE_EXECUTOR_<CHAIN_UPPERCASE> for ${chainKey}`);

  const key = process.env.TRIPWIRE_PK;
  if (!key) throw new Error("Set TRIPWIRE_PK=<private-key> for the swap signer");
  const account = privateKeyToAccount(key);

  const chain = {
    id: cfg.id,
    name: cfg.name,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [cfg.rpc] } }
  };
  const origin = createPublicClient({ chain, transport: http(cfg.rpc) });
  const lasna = createPublicClient({
    chain: { id: 5318007, name: "Reactive Lasna", nativeCurrency: { name: "lREACT", symbol: "lREACT", decimals: 18 }, rpcUrls: { default: { http: [LASNA_RPC] } } },
    transport: http(LASNA_RPC)
  });
  const wallet = createWalletClient({ account, chain, transport: http(cfg.rpc) });

  const tokenIn = side === "weth" ? cfg.weth : cfg.usdc;
  const tokenOut = side === "weth" ? cfg.usdc : cfg.weth;
  const amountInRaw = side === "weth" ? parseEther(arg("amount", "0.01")) : BigInt(Math.floor(Number(arg("amount", "10")) * 1e6));

  let swapTx;
  if (!skipSwap) {
    const allowance = await origin.readContract({ address: tokenIn, abi: erc20Abi, functionName: "allowance", args: [account.address, cfg.router] });
    if (allowance < amountInRaw) {
      console.log(`Approving router for ${side}…`);
      const approveTx = await wallet.writeContract({ address: tokenIn, abi: erc20Abi, functionName: "approve", args: [cfg.router, amountInRaw] });
      await origin.waitForTransactionReceipt({ hash: approveTx });
    }
    console.log(`Swapping ${formatEtherish(amountInRaw, side)} ${side} -> ${side === "weth" ? "USDC" : "WETH"}…`);
    swapTx = await wallet.writeContract({
      address: cfg.router,
      abi: routerAbi,
      functionName: "exactInputSingle",
      args: [
        {
          tokenIn,
          tokenOut,
          fee: feeTier,
          recipient: account.address,
          amountIn: amountInRaw,
          amountOutMinimum: 0n,
          sqrtPriceLimitX96: 0n
        }
      ]
    });
    console.log(`swap tx: ${swapTx}`);
  } else {
    swapTx = arg("swap-tx");
    console.log(`skipping swap, watching from swap tx: ${swapTx}`);
  }

  const swapReceipt = await origin.waitForTransactionReceipt({ hash: swapTx });
  const swapBlock = await withRetry(() => origin.getBlock({ blockNumber: swapReceipt.blockNumber }));
  const swapTime = Number(swapBlock.timestamp) * 1000;
  console.log(`origin swap landed in block ${swapBlock.number} @ ${new Date(swapTime).toISOString()}`);

  console.log("Watching Lasna for the reactive transaction (TripwireFired)…");
  let reactiveTx;
  let reactiveBlock = null;
  const lasnaNow = await lasna.getBlockNumber();
  const startBlock = lasnaNow > 200n ? lasnaNow - 200n : 0n;
  for (let attempt = 0; attempt < 90; attempt++) {
    const latest = await lasna.getBlockNumber();
    const logs = await lasna.getLogs({
      address: REACTIVE,
      event: parseAbiItem("event TripwireFired(bytes32 key, uint256 chainId, uint256 orderId)"),
      fromBlock: startBlock,
      toBlock: latest
    });
    const hit = logs.find((l) => l.args.orderId === orderId);
    if (hit) {
      reactiveTx = hit.transactionHash;
      reactiveBlock = await withRetry(() => lasna.getBlock({ blockNumber: hit.blockNumber }));
      console.log(`reactive tx: ${reactiveTx} (block ${hit.blockNumber})`);
      break;
    }
    await sleep(2000);
  }
  if (!reactiveTx) throw new Error("Timed out waiting for TripwireFired on Lasna (3 minutes)");

  console.log("Watching destination chain for the OrderExecuted callback…");
  let callbackTx;
  let callbackBlock = null;
  for (let attempt = 0; attempt < 90; attempt++) {
    const logs = await origin.getLogs({
      address: cfg.executor,
      event: ORDER_EXECUTED,
      args: { orderId },
      fromBlock: swapReceipt.blockNumber,
      toBlock: "latest"
    });
    const hit = logs[0];
    if (hit) {
      callbackTx = hit.transactionHash;
      callbackBlock = await withRetry(() => origin.getBlock({ blockNumber: hit.blockNumber }));
      console.log(`callback tx: ${callbackTx} (block ${hit.blockNumber})`);
      break;
    }
    await sleep(1000);
  }
  if (!callbackTx) throw new Error("Timed out waiting for OrderExecuted callback on destination chain");

  const callbackTime = Number(callbackBlock.timestamp) * 1000;
  const loopMs = callbackTime - swapTime;

  const record = {
    chain: cfg.name,
    chainId: cfg.id,
    orderId: Number(orderId),
    swapTx,
    reactiveTx,
    callbackTx,
    loopMs,
    swapBlock: Number(swapBlock.number),
    callbackBlock: Number(callbackBlock.number),
    note: `${side} swap across trigger`
  };

  let runs = { updatedAt: new Date().toISOString(), runs: [] };
  if (fs.existsSync(RUNS_JSON)) {
    try {
      runs = JSON.parse(fs.readFileSync(RUNS_JSON, "utf8"));
      runs.runs = Array.isArray(runs.runs) ? runs.runs : [];
    } catch {
      runs = { updatedAt: new Date().toISOString(), runs: [] };
    }
  }
  runs.runs.push(record);
  runs.updatedAt = new Date().toISOString();
  fs.writeFileSync(RUNS_JSON, JSON.stringify(runs, null, 2) + "\n");

  console.log("");
  console.log(`FULL LOOP: ${(loopMs / 1000).toFixed(2)}s`);
  console.log(`  origin swap:      ${cfg.explorer}/tx/${swapTx}`);
  console.log(`  lasna reactive:   https://lasna.reactscan.net/tx/${reactiveTx}`);
  console.log(`  destination fill: ${cfg.explorer}/tx/${callbackTx}`);
  console.log(`recorded in ${RUNS_JSON}`);
}

function formatEtherish(raw, side) {
  return side === "weth" ? formatEther(raw) : (Number(raw) / 1e6).toFixed(2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
