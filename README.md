# WhatsApp AI-Agent Harness

A multi-tenant harness that puts an AI agent on a WhatsApp number, built on
[Baileys](https://baileys.wiki) (websocket, no browser). This repository is the
foundation: configuration, data model, and the stable contracts the runtime
plugs into. The full design lives in the build-plan doc.

## Architecture

Three layers, kept separate so each can be hardened or swapped on its own, plus
a cross-cutting control plane.

- **Transport** — the Baileys socket, reconnection, and its stores
  (`src/transport`): `ConnectionManager`, `authStore`, `messageStore`,
  `eventRouter`.
- **Orchestration** — turns an inbound message into an agent call and a paced
  reply (`src/orchestration`): `MessagePipeline`, `SafeSender`.
- **Intelligence** — the model adapters and prompt (`src/intelligence`).
- **Control** — tenants, config, session leasing, and the worker runtime
  (`src/control`).

Outbound messages go through `SafeSender`, which paces sends per number with
jitter and an optional daily cap — the ban-avoidance seam.

Everything a tenant differs on is **data keyed by `tenant_id`**, never code.
Effective behavior resolves at runtime by merging three layers:
platform defaults → vertical pack → tenant overrides (`src/config/resolver.ts`).

## Prerequisites

- Node.js >= 20
- PostgreSQL with the [pgvector](https://github.com/pgvector/pgvector) extension
- Redis

## Setup

```bash
npm install
cp .env.example .env   # set DATABASE_URL (or DB_HOST/DB_NAME/...), REDIS_URL
```

Set `DATABASE_SSL=true` for managed Postgres such as Render. Then apply the
schema (runs `sql/*.sql` in order against the configured database):

```bash
npm run migrate
```

`sql/009_rls.sql` enables row-level security; it is enforced only for non-owner
roles, so run the app under a dedicated role to activate isolation.
`sql/010_seed.sql` loads platform defaults, the tool registry, and the `clinic`
and `law_firm` packs.

Confirm the config layer resolves a different bot per vertical:

```bash
npm run demo:config -- clinic
npm run demo:config -- law_firm
```

Managed Redis such as Upstash needs TLS — use a `rediss://` URL.

## Run

Link a tenant's number (provisions the tenant, then links by pairing code;
add `--qr` to scan a QR instead). The process stays running after linking.

```bash
npm run link -- --slug acme --name "Acme Clinic" --vertical clinic --phone 15551234567
```

Start the worker, which hosts every number leased to it and routes messages
through the pipeline:

```bash
npm run dev
```

## Model providers

A tenant selects its provider and model in config (`model.provider` is one of
`echo`, `anthropic`, `openai`, `gemini`, `openrouter`). `echo` needs no key and
runs the whole pipeline offline. Set the matching `*_API_KEY` in `.env` for the
providers you use. `ModelAgent` builds the system prompt from the tenant's
persona, guardrails, and enabled tools, then calls the selected model.

## Data model

| Area | Tables |
| --- | --- |
| Config | `platform_defaults`, `vertical_packs`, `tool_registry` |
| Tenancy | `tenants`, `tenant_config`, `tenant_numbers`, `tenant_tools` |
| Auth | `wa_auth_creds`, `wa_signal_keys` |
| Messaging | `messages`, `message_runs`, `handoffs` |
| Customers | `customers` |
| Knowledge | `knowledge_documents`, `knowledge_chunks` |
| Usage | `usage_events` |

## Security notes

- `wa_auth_creds` / `wa_signal_keys` and `tenant_tools.credentials` hold secrets
  equivalent to private keys. In production, wrap them in per-tenant envelope
  encryption (KMS) and back up the auth tables.
- Set the embedding dimension in `sql/007_knowledge.sql` to match your model.

## Status

Implemented: config layer (layered resolver + per-tenant model and tools), full
schema applied, DB-backed auth store, message store, tenant repository,
multi-provider model layer (anthropic / openai / gemini / openrouter / echo),
config-driven `ModelAgent`, tool registry, and the transport runtime —
connection manager (reconnect, keep-alive, pairing/QR), event router with LID/PN
normalization, safe sender, message pipeline, and the worker runtime with number
leasing.

Next: intent routing + RAG retrieval over `knowledge_chunks`, tool execution,
human handoff inbox, usage metering/cost caps, and an official Cloud API adapter
behind the same transport boundary.
