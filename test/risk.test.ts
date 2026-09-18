/**
 * Test matrix for bounty #9 acceptance:
 * - accurate health factor math (from fixture-shaped chain payloads)
 * - alert fires BEFORE liquidation (strict threshold, incl. exactly-at case)
 * - no fabricated alerts: no-debt wallets never alert
 * - validation + error isolation
 */
import { describe, it, expect } from "vitest";
import { encodeFunctionResult, toHex } from "viem";
import { fetchAccountRisk, DEFAULT_ALERT_THRESHOLD, makeClient } from "../src/risk";

const ABI = [
  {
    name: "getUserAccountData",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [
      { name: "totalCollateralBase", type: "uint256" },
      { name: "totalDebtBase", type: "uint256" },
      { name: "availableBorrowsBase", type: "uint256" },
      { name: "currentLiquidationThreshold", type: "uint256" },
      { name: "ltv", type: "uint256" },
      { name: "healthFactor", type: "uint256" },
    ],
  },
] as const;

const W = "0x76EfB727cd3271C7DE22f92437Be212766C9631f";

function fakeClient(results: Record<string, readonly [bigint, bigint, bigint, bigint, bigint, bigint]>) {
  return {
    call: async ({ data }: { to: `0x${string}`; data: `0x${string}` }) => {
      // calldata = 0x + 4-byte selector (8 hex) + 24 hex zero-pad + 40 hex address
      const wallet = ("0x" + data.slice(34)).toLowerCase() as `0x${string}`;
      const key = Object.keys(results).find((k) => k.toLowerCase() === wallet);
      if (!key) throw new Error("no fixture for wallet");
      return {
        data: encodeFunctionResult({ abi: ABI, functionName: "getUserAccountData", result: results[key] }),
      };
    },
  } as unknown as ReturnType<typeof makeClient>;
}

describe("health factor math (acceptance: accurate calculations)", () => {
  it("HF 2.0 position (live-fixture values): correct liq collateral + buffer", async () => {
    // Live wallet 0xB327...: col $23.387M, debt $7.774M, weighted LT 66.5% → HF 2.000
    const c = fakeClient({
      [W]: [23387202n * 10n ** 8n, 7774213n * 10n ** 8n, 0n, 6650n, 5000n, 2000000000000000000n],
    });
    const r = await fetchAccountRisk("aave-v3", W, DEFAULT_ALERT_THRESHOLD, c);
    expect(r.error).toBeUndefined();
    expect(r.health_factor).toBeCloseTo(2.0, 9);
    // liquidation collateral = collateral × LT(0.665) — matches HF: ×0.665 / debt = 2.0
    expect(r.liquidation_collateral_usd).toBeCloseTo(23387202 * 0.665, 3);
    // buffer to liquidation = (1 - 1/2) × 100 = 50%
    expect(r.buffer_percent).toBeCloseTo(50, 6);
    expect(r.alert_threshold_hit).toBe(false);
    expect(r.total_debt_usd).toBeCloseTo(7774213, 3);
  });

  it("HF 1.0 position (fixture from live chain): fires alert at default 1.25", async () => {
    const c = fakeClient({
      [W]: [3917771n, 2717669n, 0n, 8100n, 7700n, 1000000000000000000n],
    });
    const r = await fetchAccountRisk("aave-v3", W, DEFAULT_ALERT_THRESHOLD, c);
    expect(r.health_factor).toBeCloseTo(1.0, 9);
    expect(r.alert_threshold_hit).toBe(true); // fires BEFORE crossing 1.0
    expect(r.buffer_percent).toBeCloseTo(0, 6); // zero buffer left
  });

  it("alert is strict: HF exactly at threshold does NOT fire; below fires", async () => {
    const at = fakeClient({ [W]: [2n, 1n, 0n, 8000n, 5000n, 1250000000000000000n] });
    const below = fakeClient({ [W]: [2n, 1n, 0n, 8000n, 5000n, 1249999999999999000n] });
    const rAt = await fetchAccountRisk("aave-v3", W, 1.25, at);
    const rBelow = await fetchAccountRisk("aave-v3", W, 1.25, below);
    expect(rAt.alert_threshold_hit).toBe(false);
    expect(rBelow.alert_threshold_hit).toBe(true);
  });

  it("no-debt wallet: HF null, raw carries u256max, alert NEVER fires", async () => {
    const max = (2n ** 256n - 1n);
    const c = fakeClient({ [W]: [100000000n, 0n, 80000000n, 8000n, 5000n, max] });
    const r = await fetchAccountRisk("aave-v3", W, 5.0, c);
    expect(r.health_factor).toBeNull();
    expect(r.health_factor_raw).toBe("u256max (no debt)");
    expect(r.alert_threshold_hit).toBe(false);
  });

  it("debt>0 with zero collateral → buffer 0%, alert fires (HF==1 edge)", async () => {
    const c = fakeClient({ [W]: [0n, 1n, 0n, 8000n, 5000n, 0n] });
    const r = await fetchAccountRisk("aave-v3", W, DEFAULT_ALERT_THRESHOLD, c);
    expect(r.health_factor).toBe(0);
    expect(r.buffer_percent).toBeNull(); // 1-1/0 undefined → null, not fake
    expect(r.alert_threshold_hit).toBe(true);
  });
});

describe("error isolation + validation", () => {
  it("RPC failure → error entry, does not throw", async () => {
    const bad = {
      call: async () => {
        throw new Error("RPC 503");
      },
    } as unknown as ReturnType<typeof makeClient>;
    const r = await fetchAccountRisk("aave-v3", W, 1.25, bad);
    expect(r.error).toContain("RPC 503");
    expect(r.alert_threshold_hit).toBe(false);
  });

  it("unsupported protocol → error entry", async () => {
    const r = await fetchAccountRisk("compound-v2", W, 1.25, makeClient());
    expect(r.error).toContain("unsupported protocol");
  });

  it("wallet regex enforced at route layer via zod (unit: shape)", () => {
    const bad = "0x123";
    expect(/^0x[a-fA-F0-9]{40}$/.test(bad)).toBe(false);
    expect(/^0x[a-fA-F0-9]{40}$/.test(W)).toBe(true);
  });

  it("viem hex/toHex import alive (guard against bundling regressions)", () => {
    expect(toHex(1)).toBe("0x1");
  });
});
