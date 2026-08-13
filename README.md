<p align="center">
  <img src="frontend/public/brand/logo.svg" alt="2Remit" width="220" />
</p>

<h1 align="center">2Remit</h1>

<p align="center">
  A correctness-first cross-border payout console built with Django, DRF, Next.js and PostgreSQL.
</p>

<p align="center">
  <a href="docs/ENGINEERING.md"><strong>Read the engineering deep dive →</strong></a>
</p>

![2Remit transfers console](docs/assets/transfers-console.png)

## Why 2Remit

2Remit follows a transfer from creation to a terminal provider outcome without hiding the hard parts of payment engineering:

- Explicit, transaction-safe transfer state machine
- Idempotent creation with durable request fingerprints
- HMAC-signed provider webhooks and delivery idempotency
- Durable PostgreSQL activity history with live SSE updates
- Server-side cursor pagination, reference search and status filtering
- Development-only provider simulator
- Docker Compose, GitHub Actions CI and structured JSON logs via Vector and VictoriaLogs

> Tests are mandatory for this project and form part of its acceptance criteria.

## Product walkthrough

| Review a payout | Track provider processing |
| --- | --- |
| ![Create transfer review](docs/assets/create-transfer-review.png) | ![Processing transfer detail](docs/assets/transfer-detail-processing.png) |

### Simulate a real provider callback

![Local provider simulator](docs/assets/provider-simulator.png)

The simulator sends an immediate signed HTTP webhook through the real handler. It does not mutate a transfer directly.

## Quick start

```bash
git clone https://github.com/babafemi99/2remmit.git
cd 2remmit
cp .env.example .env
make compose-up
```

Review the local-only values in `.env` before starting. `make compose-up` passes that file explicitly to Docker Compose, builds the images, runs both test suites as startup gates, applies migrations, seeds demo data, and starts the healthy stack. If either test gate fails, the applications do not start.

| Service | URL |
| --- | --- |
| 2Remit frontend | http://localhost:3000/transfers |
| Django API | http://localhost:8000/api/transfers/ |
| Provider simulator | http://localhost:3000/dev |
| VictoriaLogs UI | http://localhost:9428/select/vmui/ |

If port 3000 is occupied:

```bash
FRONTEND_PORT=3100 make compose-up
```

Startup waits for PostgreSQL, applies migrations, and seeds five stable demo transfers. Seeding is safe to repeat:

```bash
make seed
```

## Five-minute demo

1. Open `/transfers`, then create a transfer: it starts **Pending**.
2. Cancel a pending transfer to demonstrate the immutable cancellation path.
3. Submit another transfer: it becomes **Processing** and receives a provider ID.
4. Keep its detail page open, then use `/dev` to send Success or Failure.
5. The signed webhook records durable activity; SSE updates the open detail view immediately.

## Run the checks

```bash
make test
```

This runs the PostgreSQL-backed Django suite plus frontend formatting, ESLint, strict TypeScript, Vitest and the production Next.js build. See the [full verification matrix](docs/ENGINEERING.md#tests-and-correctness-evidence).

## Architecture

![2Remit architecture](docs/assets/architecture-simple.png)

**Stack:** Python 3.14, Django 5.2, Django REST Framework, PostgreSQL 17, Next.js 16, React 19, TypeScript, Docker Compose, Vector and VictoriaLogs.

## Scope and limitations

Authentication is intentionally omitted for this open local assessment API; the implications and production boundary are [documented explicitly](docs/ENGINEERING.md#security-boundary). KYC, wallets, FX pricing, a double-entry ledger, real provider integration and cloud deployment are deliberately excluded.

The primary runtime limitation is that SSE wake-ups are process-local and Compose intentionally runs one ASGI worker. Durable activity replay prevents data loss, but multi-worker live fan-out would require PostgreSQL `LISTEN/NOTIFY` or shared pub/sub.

## Submission links

- [Engineering deep dive](docs/ENGINEERING.md)
- Live deployment: not deployed; the verified Docker Compose environment is the submission runtime
