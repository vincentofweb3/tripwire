import { describe, expect, it } from "vitest";
import {
  isCrossed,
  sqrtPriceForTarget,
  triggerFromTarget,
  usdcPerEth
} from "./orders";

describe("price math", () => {
  it("round-trips USDC-per-ETH through sqrtPriceX96", () => {
    const target = 35000;
    const sqrtP = sqrtPriceForTarget(target);
    const back = usdcPerEth(sqrtP);
    expect(back).toBeGreaterThan(target * 0.99);
    expect(back).toBeLessThan(target * 1.01);
  });

  it("maps >= target to a raw fireBelow trigger", () => {
    const { fireAbove } = triggerFromTarget(30000, "gte");
    expect(fireAbove).toBe(false);
  });

  it("maps <= target to a raw fireAbove trigger", () => {
    const { fireAbove } = triggerFromTarget(30000, "lte");
    expect(fireAbove).toBe(true);
  });

  it("isCrossed mirrors contract semantics", () => {
    const trigger = sqrtPriceForTarget(30000);
    expect(isCrossed(trigger, trigger, true)).toBe(true);
    expect(isCrossed(trigger, trigger, false)).toBe(true);
    expect(isCrossed(trigger + 1n, trigger, true)).toBe(true);
    expect(isCrossed(trigger - 1n, trigger, true)).toBe(false);
    expect(isCrossed(trigger - 1n, trigger, false)).toBe(true);
    expect(isCrossed(trigger + 1n, trigger, false)).toBe(false);
  });

  it("a higher USDC-per-ETH price is a lower raw sqrtPrice", () => {
    const hi = sqrtPriceForTarget(40000);
    const lo = sqrtPriceForTarget(20000);
    expect(hi).toBeLessThan(lo);
  });
});
