# 2Remit

2Remit is a Django/DRF payout API with a Next.js console, durable transfer activity, signed provider webhooks, and SSE live updates.

## Container stack

Copy the documented environment values and replace the placeholder secrets:

```bash
cp .env.example .env
docker compose up --build
```

Open the frontend at <http://localhost:3000>, the API at <http://localhost:8000/api/transfers/>, and VictoriaLogs at <http://localhost:9428/select/vmui/>. Startup waits for PostgreSQL, applies migrations once, and runs the idempotent demo seed before starting the single-worker ASGI backend.

Convenience commands:

```bash
make compose-up
make compose-logs
make seed
make test
make compose-down
```

`make seed` can be run repeatedly. It creates only missing stable demo records and never changes existing records.

## Provider and SSE demonstration

Create or choose a pending transfer, submit it, open its detail page, then use `/dev` to send a success or failure event. The simulator sends a real HMAC-signed HTTP webhook immediately. The resulting activity commits with the FSM transition and wakes the open SSE stream.

The current live notifier intentionally supports one backend application worker. Multi-worker deployment requires replacing the process-local wake-up mechanism while retaining the durable activity cursor contract.

## Logs

Django and Next.js emit JSON to container stdout/stderr. Vector reads only the backend and frontend container logs and sends them to VictoriaLogs. Secrets, signatures, idempotency keys, sensitive headers, and request bodies are not application log fields.

Example LogsQL queries against the HTTP API:

```bash
curl -G 'http://localhost:9428/select/logsql/query' --data-urlencode 'query=service:backend'
curl -G 'http://localhost:9428/select/logsql/query' --data-urlencode 'query=service:backend AND event:webhook.processed'
curl -G 'http://localhost:9428/select/logsql/query' --data-urlencode 'query=service:frontend'
```

The built-in VictoriaLogs UI is available at <http://localhost:9428/select/vmui/>. Volumes persist PostgreSQL, VictoriaLogs, and Vector checkpoints across ordinary Compose restarts.
