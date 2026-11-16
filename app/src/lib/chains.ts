import { defineChain } from "viem";
import type { Address, Chain } from "viem";

export const unichainSepolia = defineChain({
  id: 1301,
  name: "Unichain Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://sepolia.unichain.org"] } },
  blockExplorers: {
    default: { name: "Uniscan", url: "https://sepolia.uniscan.xyz" }
  },
  testnet: true
});

export const baseSepolia = defineChain({
  id: 84532,
  name: "Base Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://sepolia.base.org"] } },
  blockExplorers: {
    default: { name: "Basescan", url: "https://sepolia.basescan.org" }
  },
  testnet: true
});

export const UNICHAIN_SEPOLIA_DEFAULT_EXECUTOR = "0x29D685cb7574443eD28A24541Dd8FeaD4C0F4A87";
export const BASE_SEPOLIA_DEFAULT_EXECUTOR = "0xDE9AE68d44e41bC2b658623b16dd4c1a2f5993A0";

export const LASNA_CHAIN_ID = 5318007;
export const LASNA_EXPLORER = "https://lasna.reactscan.net";

export interface PoolConfig {
  fee: 500 | 3000;
  address: Address;
  label: string;
}

export interface TripwireChainConfig {
  chain: Chain;
  usdc: Address;
  weth: Address;
  usdcDecimals: number;
  pools: PoolConfig[];
  callbackProxy: Address;
  executor: Address | undefined;
  /** Hint block for log scans (covers the whole deployment); log RPCs cap range size. */
  scanFrom: bigint;
}

const EXECUTOR_1301 = import.meta.env.VITE_EXECUTOR_UNICHAIN_SEPOLIA as Address | undefined;
const EXECUTOR_84532 = import.meta.env.VITE_EXECUTOR_BASE_SEPOLIA as Address | undefined;

export const CHAINS: Record<number, TripwireChainConfig> = {
  1301: {
    chain: unichainSepolia,
    usdc: "0x31d0220469e10c4e71834a79b1f276d740d3768f",
    weth: "0x4200000000000000000000000000000000000006",
    usdcDecimals: 6,
    pools: [
      { fee: 500, address: "0xBeAD5792bB6C299AB11Eaa425aC3fE11ebA47b3B", label: "USDC/WETH 0.05%" },
      { fee: 3000, address: "0x8F463126bBEA80A10DF9Bf6FF5455B6B0292B34e", label: "USDC/WETH 0.3%" }
    ],
    callbackProxy: "0x775c9B990ADe401060B78D0e98684eEf8d2466C1",
    executor: EXECUTOR_1301,
    scanFrom: 67_800_000n
  },
  84532: {
    chain: baseSepolia,
    usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    weth: "0x4200000000000000000000000000000000000006",
    usdcDecimals: 6,
    pools: [
      { fee: 500, address: "0x94bfc0574FF48E92cE43d495376C477B1d0EEeC0", label: "USDC/WETH 0.05%" },
      { fee: 3000, address: "0x46880b404CD35c165EDdefF7421019F8dD25F4Ad", label: "USDC/WETH 0.3%" }
    ],
    callbackProxy: "0x476F44b11F5C942c58f4c8E3d0300E5710743585",
    executor: EXECUTOR_84532,
    scanFrom: 59_640_000n
  }
};

export const SUPPORTED_CHAIN_IDS = [1301, 84532] as const;
