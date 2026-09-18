/** Response types per bounty #9 spec: health_factor, liq_price buffer, alert. */

export interface PositionRisk {
  wallet: string;
  protocol: string;
  /** Aave health factor, 1.0 = liquidation. null only if chain returned nothing. */
  health_factor: number | null;
  /** USD collateral value at liquidation: collateral × liquidation_threshold (8-dec USD). */
  liquidation_collateral_usd: number | null;
  /** Safety buffer as percent drop in collateral value before liquidation (0–100+). */
  buffer_percent: number | null;
  /** True iff health_factor < alert_threshold (strict). Never fabricated. */
  alert_threshold_hit: boolean;
  /** USD values (8-dec USD) for transparency. */
  total_collateral_usd: number | null;
  total_debt_usd: number | null;
  /** Raw healthFactor from chain (1e18 fixed point) — null when no debt. */
  health_factor_raw: string | null;
  block_number: number | null;
  source_ts: string;
  error?: string;
}

export interface PositionsResponse {
  output: {
    positions: PositionRisk[];
    errors: { wallet: string; error: string }[];
  };
  usage: {
    wallets_queried: number;
    ok: number;
    errored: number;
    duration_ms: number;
  };
}
