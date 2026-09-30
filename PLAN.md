# Implementation Plan for Aave V3 Liquidation-Risk Sentinel (Bounty #9)

## Objective
Deploy and verify the lending-liquidation-sentinel worker for Aave V3 liquidation risk monitoring on Base with x402 payment.

## Steps

### 1. Verify Codebase Integrity
- Ensure all tests pass: `npm test`
- Ensure TypeScript checks pass: `npm run typecheck`
- Verify no TODO/FIXME in src/ (already done)

### 2. Deploy to Cloudflare Workers
- Run `wrangler deploy` to deploy the worker using the configuration in wrangler.toml
- Capture the assigned subdomain from the deployment output (e.g., `lending-liquidation-sentinel.<random>.workers.dev`)

### 3. Verify Deployment
- Check health endpoint: `GET https://<deployed-subdomain>/health` should return 200 with service info
- Check x402 configuration: `GET https://<deployed-subdomain>/.well-known/x402.json` should return valid x402 configuration
- Verify payment middleware: `POST https://<deployed-subdomain>/positions` should require x402 payment (return 402 without payment)

### 4. Update Bounty Submission
- Update the GitHub issue daydreamsai/agent-bounties#342 with the new live URL
- Note: The live URL may change due to temporary Cloudflare accounts; consider setting up a custom domain or updating the submission URL on each deploy

### 5. Optional: Validate Against Known Addresses
- Test with a known Aave V3 borrower on Base (e.g., from the submission: addresses with HF 2.000, 3.000, 0.9967)
- Verify the risk calculation matches expectations

## Risks and Critical Paths
- **Deployment Failure**: If wrangler deploy fails due to missing secrets or configuration, check wrangler.toml and environment variables.
- **Health Check Failure**: If the worker does not start, check the logs via `wrangler logs`.
- **x402 Misconfiguration**: Ensure the ORG_EVM_PAYTO address in wrangler.toml matches the intended recipient.
- **RPC Endpoint**: The worker uses a public Base RPC; if rate-limited, consider setting up a dedicated RPC.

## Complexity Assessment
Low: The code is already written, tested, and type-checked. Deployment and verification are straightforward.

## Codebase Context
- The sentinel uses viem to call Aave V3 Pool.getUserAccountData on Base.
- Health factor calculation follows Aave V3 specifications.
- x402 middleware handles payment for the /positions endpoint.
- The worker is designed to be stateless and autonomous.

## Next Action
Hand off this plan to the Staff Engineer for implementation.