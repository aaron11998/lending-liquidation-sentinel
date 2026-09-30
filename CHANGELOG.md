# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.1] — 2026-10-01 (GST-25 discovery parity)

### Added
- `/.well-known/x402.json` manifest endpoint — x402 discovery parity with
  `perps-funding-pulse` and `yield-pool-watcher`. All three services
  now advertise identical manifest shape (x402Version, resource, description,
  accepts exact/eip155:8453/Base USDC/$0.01/call, payTo 0x76EfB727cd3271C7DE22f92437Be212766C9631f).

## [1.0.0] — 2026-09-30 (Initial release)

### Added
- Workers entrypoint with `/health`, `/.well-known/x402.json` (free), and `POST /positions` (paid $0.01 Base USDC via x402).
- Aave V3 on-chain risk computation via viem (no indexer).
- Alert threshold logic with HF 1.25 default.
- Offline unit tests (9 tests in test/risk.test.ts).
