/**
 * lending-liquidation-sentinel — Workers entrypoint (bounty #9).
 * Free: GET /health, GET /.well-known/x402.json
 * Paid: POST /positions — $0.01 Base USDC via x402.
 *
 * On-chain truth (no indexer): Aave V3 Base Pool.getUserAccountData via viem.
 * Alert threshold: default HF 1.25 (firing requires STRICTLY below 1.25 —
 * never a fabricated alert at exactly 1.0).
 */
import { Hono } from "hono";
import { paymentMiddleware } from "x402-hono";
import { z } from "zod";
import {
  fetchAccountRisk,
  PROTOCOLS,
  DEFAULT_ALERT_THRESHOLD,
} from "./risk";
import type { PositionsResponse } from "./types";

const X402_NETWORK = "eip155:8453";
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

type Bindings = { ORG_EVM_PAYTO: string };

const app = new Hono<{ Bindings: Bindings }>();

app.get("/health", (c) =>
  c.json({
    status: "ok",
    service: "lending-liquidation-sentinel",
    protocols: PROTOCOLS,
    x402: { network: X402_NETWORK, asset: USDC_BASE, price: "$0.01/call" },
    defaults: { alert_threshold: DEFAULT_ALERT_THRESHOLD },
  }),
);

app.get("/.well-known/x402.json", (c) =>
  c.json({
    x402Version: 2,
    resource: "/positions",
    description:
      "Aave V3 borrow-position liquidation risk: health factor, liq price buffer, threshold alerts",
    accepts: [
      {
        scheme: "exact",
        network: X402_NETWORK,
        asset: USDC_BASE,
        payTo: c.env.ORG_EVM_PAYTO,
        maxAmountRequired: "10000",
        resource: "/positions",
        description: "One /positions risk query",
      },
    ],
    free: ["/health", "/.well-known/x402.json"],
  }),
);

app.use("/positions", async (c, next) => {
  const mw = paymentMiddleware(c.env.ORG_EVM_PAYTO as `0x${string}`, {
    "/positions": {
      price: "$0.01",
      network: "base",
      config: { description: "Aave V3 liquidation-risk check" },
    },
  });
  return mw(c, next);
});

const PositionsBody = z.object({
  wallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "wallet must be 0x + 40 hex"),
  protocol_ids: z.array(z.string()).max(10).optional(),
  alert_threshold: z.number().min(0.01).max(1000).optional(),
});

app.post("/positions", async (c) => {
  let raw: unknown = {};
  try {
    raw = await c.req.json();
  } catch {
    /* fallthrough → schema error below */
  }
  const parsed = PositionsBody.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    return c.json(
      {
        output: {
          positions: [],
          errors: [{ wallet: "request", error: msg }],
        },
        usage: { wallets_queried: 0, ok: 0, errored: 0, duration_ms: 0 },
      } satisfies PositionsResponse,
      400,
    );
  }
  const { wallet, protocol_ids, alert_threshold } = parsed.data;
  const threshold = alert_threshold ?? DEFAULT_ALERT_THRESHOLD;
  const unknown = (protocol_ids ?? []).filter(
    (p) => !(PROTOCOLS as readonly string[]).includes(p),
  );
  const wanted = (protocol_ids ?? []).filter((p) =>
    (PROTOCOLS as readonly string[]).includes(p),
  );
  const protocols = (wanted.length ? wanted : [...PROTOCOLS]) as (
    | "aave-v3"
  )[];

  const started = Date.now();
  const results = await Promise.all(
    protocols.map((p) => fetchAccountRisk(p, wallet, threshold)),
  );
  const usage = {
    wallets_queried: protocols.length,
    ok: results.filter((r) => !r.error).length,
    errored: results.filter((r) => r.error).length,
    duration_ms: Date.now() - started,
  };
  return c.json({
    output: {
      positions: results.filter((r) => !r.error),
      errors: [
        ...results
          .filter((r) => r.error)
          .map((r) => ({ wallet: r.wallet, error: r.error! })),
        ...unknown.map((p) => ({ wallet: p, error: "unknown protocol_id" })),
      ],
    },
    usage,
  } satisfies PositionsResponse);
});

export default app;
