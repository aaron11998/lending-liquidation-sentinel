/**
 * On-chain risk reads — Aave V3 via canonical Pool.getUserAccountData (viem).
 * Addresses from @bgd-labs/aave-address-book (AaveV3Base), verified live 2026-09-18:
 *   POOL 0xA238Dd80C259a72e81d7e4664a9801593F98d1c5
 * Aave convention: healthFactor = type(uint256).max when totalDebt == 0.
 * buffer_percent = (1 - 1/HF) × 100 — the % collateral-value drop that reaches liquidation.
 */
import { createPublicClient, http, encodeFunctionData, decodeFunctionResult } from "viem";
import { base } from "viem/chains";
import type { PositionRisk } from "./types";

export const PROTOCOLS = ["aave-v3"] as const;

export const DEFAULT_ALERT_THRESHOLD = 1.25;

export const AAVE_V3_BASE_POOL = "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5" as const;

const ACCOUNT_DATA_ABI = [
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

/** Injectable RPC client for tests. */
export type RpcClient = ReturnType<typeof makeClient>;

export function makeClient(url = "https://mainnet.base.org") {
  return createPublicClient({ chain: base, transport: http(url) });
}

const U256_MAX =
  115792089237316195423570985008687907853269984665640564039457584007913129639935n;

export async function fetchAccountRisk(
  protocol: string,
  wallet: string,
  alertThreshold: number,
  client: RpcClient = makeClient(),
): Promise<PositionRisk> {
  const base0: PositionRisk = {
    wallet,
    protocol,
    health_factor: null,
    liquidation_collateral_usd: null,
    buffer_percent: null,
    alert_threshold_hit: false,
    total_collateral_usd: null,
    total_debt_usd: null,
    health_factor_raw: null,
    block_number: null,
    source_ts: new Date().toISOString(),
  };
  if (protocol !== "aave-v3") {
    return { ...base0, error: `unsupported protocol ${protocol}` };
  }
  try {
    const data = encodeFunctionData({
      abi: ACCOUNT_DATA_ABI,
      functionName: "getUserAccountData",
      args: [wallet as `0x${string}`],
    });
    const { data: raw } = await client.call({ to: AAVE_V3_BASE_POOL, data });
    if (raw === undefined) throw new Error("empty RPC response");
    const [collateral, debt, , liqThreshold, , hfRaw] = decodeFunctionResult({
      abi: ACCOUNT_DATA_ABI,
      functionName: "getUserAccountData",
      data: raw,
    });
    const noDebt = debt === 0n;
    const hf = noDebt ? null : Number(hfRaw) / 1e18;
    const colUsd = Number(collateral) / 1e8;
    const debtUsd = Number(debt) / 1e8;
    const liqCollateralUsd =
      !noDebt && liqThreshold > 0n ? (colUsd * Number(liqThreshold)) / 10000 : null;
    const bufferPercent = hf !== null && hf > 0 ? (1 - 1 / hf) * 100 : null;
    const hfRawStr =
      hfRaw === U256_MAX ? "u256max (no debt)" : hfRaw.toString();
    return {
      ...base0,
      health_factor: hf,
      liquidation_collateral_usd: liqCollateralUsd,
      buffer_percent: bufferPercent,
      // STRICT < : a position at exactly the threshold is not yet an alert.
      alert_threshold_hit: hf !== null && hf < alertThreshold,
      total_collateral_usd: colUsd,
      total_debt_usd: debtUsd,
      health_factor_raw: hfRawStr,
      block_number: null,
    };
  } catch (err) {
    return {
      ...base0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
