/**
 * Price math for USDC/WETH Uniswap V3 pools.
 *
 * token0 = USDC (6dp), token1 = WETH (18dp).
 * rawPrice = amount1_raw / amount0_raw = (sqrtPriceX96 / 2^96)^2
 * USDC per 1 ETH = 1e12 / rawPrice
 *
 * The pool's sqrtPriceX96 moves *inversely* to the human USDC-per-ETH price.
 */

export const Q96 = 2n ** 96n;
export const Q96_NUM = Number(Q96);

/** sqrtP -> human USDC per 1 ETH */
export function usdcPerEth(sqrtPriceX96: bigint): number {
  const ratio = Number(sqrtPriceX96) / Q96_NUM;
  const rawPrice = ratio * ratio;
  return 1e12 / rawPrice;
}

/** human sqrtP threshold for a USDC-per-ETH target */
export function sqrtPriceForTarget(usdcPerEthTarget: number): bigint {
  if (!(usdcPerEthTarget > 0)) throw new Error("target must be positive");
  const rawPrice = 1e12 / usdcPerEthTarget;
  return BigInt(Math.floor(Math.sqrt(rawPrice) * Q96_NUM));
}

export type PriceCondition = "gte" | "lte";

/**
 * Build the (trigger, fireAbove) pair for "fire when USDC/ETH is >= target" or "<= target".
 * USDC/ETH >= target  <=>  sqrtP <= sqrt(target)   (fire below in raw terms)
 * USDC/ETH <= target  <=>  sqrtP >= sqrt(target)   (fire above in raw terms)
 */
export function triggerFromTarget(
  usdcPerEthTarget: number,
  condition: PriceCondition
): { trigger: bigint; fireAbove: boolean } {
  const trigger = sqrtPriceForTarget(usdcPerEthTarget);
  const fireAbove = condition === "lte";
  return { trigger, fireAbove };
}

/** Predicate mirroring TripwireReactive/TripwireExecutor crossing logic. */
export function isCrossed(sqrtPriceX96: bigint, trigger: bigint, fireAbove: boolean): boolean {
  return fireAbove ? sqrtPriceX96 >= trigger : sqrtPriceX96 <= trigger;
}

const formatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

export function formatUsdcPerEth(v: number): string {
  return `$${formatter.format(v)}`;
}

export function formatToken(amount: bigint, decimals: number, maxFractionDigits = 4): string {
  const base = 10 ** decimals;
  const whole = Number(amount / BigInt(base));
  const frac = Number(amount % BigInt(base)) / base;
  return (whole + frac).toFixed(maxFractionDigits).replace(/\.?0+$/, "");
}

export function parseToken(input: string, decimals: number): bigint {
  const trimmed = input.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) throw new Error("Invalid amount");
  const [whole, frac = ""] = trimmed.split(".");
  const fracPadded = (frac + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(whole) * BigInt(10n ** BigInt(decimals)) + BigInt(fracPadded || "0");
}
