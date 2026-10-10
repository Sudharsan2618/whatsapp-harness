# Delivery backlog

Execution checklist. Each task names an acceptance test so it ships as a working,
testable increment. Built in order; `[x]` = done and tested.

## Shipped (phases 0–3 + transport runtime)

- [x] Schema + config layer (layered resolver), DB auth store, message store
- [x] Multi-provider models (anthropic / openai / gemini / openrouter / echo)
- [x] Transport runtime: connection manager (reconnect, pairing/QR), event router
      (LID/PN), safe sender (jitter + cap), pipeline, worker runtime, leasing
- [x] Live: real number linked, serving via OpenRouter `openai/gpt-6-luna`

---

## 1. Accuracy layer

- [x] 1.1 Conversation memory — feed recent turns into the model. (verified:
      recalled "2 tonnes" across turns)
- [x] 1.2 Usage metering — record tokens per LLM call in `usage_events`.
      (verified: row with 477/37 tokens)
- [x] 1.3 Knowledge store + retrieval (Postgres full-text v1).
- [x] 1.4 Knowledge ingestion — local file now; URL via Firecrawl (`npm run ingest`).
- [x] 1.5 Grounded answers — answer only from retrieved knowledge, else defer.
      (verified: certs/MOQ grounded; turmeric deferred to the team)
- [x] 1.6 Intent route — derived from tool outcome (handoff/action/info) and
      recorded on `message_runs`. (A dedicated pre-classifier can come later.)
- [x] 1.7 Confidence floor — OR-semantics full-text + min-rank; conversational
      filler no longer breaks retrieval. (Real confidence lands with 1.9 vectors.)
- [x] 1.8 Tool execution — OpenAI/OpenRouter function-calling loop + dispatch.
      (verified: escalation message triggered `handoff_human`)
- [ ] 1.9 Semantic retrieval (pgvector) — add an embedder, re-rank with vectors.

## 2. Human handoff

- [x] 2.1 Open a handoff on escalation; pause the bot for that chat.
      (verified: handoff row opened, follow-up message got no bot reply)
- [x] 2.2 Owner takeover + resume — `npm run handoff --list` / `--close`.
      (verified: after close, the bot resumed and answered grounded)
- [ ] 2.3 Owner notification (channel TBD: dashboard / email / webhook).
- [ ] 2.4 Shared inbox view (needs the dashboard, area 5).

## 3. Fleet / ops hardening

- [x] 3.0 Process resilience — pg pool `error` handler + keep-alive, and
      unhandled-rejection / uncaught-exception guards, so an idle-connection reset
      or one tenant's blip cannot crash the worker. (fixed a live crash)
- [ ] 3.1 Lease renewal heartbeat; pick up newly-linked numbers without restart.
      Test: link a number while the worker runs → it starts serving within N s.
- [ ] 3.2 Re-claim on worker failure (lease expiry handoff between workers).
- [ ] 3.3 Per-tenant envelope encryption (KMS) for auth + tool credentials.
- [ ] 3.4 Enforce RLS under a non-owner DB role.
- [ ] 3.5 Automated auth-state backups.
- [ ] 3.6 Health monitoring + metrics per number (uptime, reconnects).

## 4. Ban-avoidance maturity

- [ ] 4.1 Warm-up ramp — daily cap grows with number age.
      Test: a day-0 number caps lower than a day-14 number.
- [ ] 4.2 Human-like pacing — typing indicator + read receipt before replying.
- [ ] 4.3 Session-health signals — detect stream errors / soft bans, alert.
- [ ] 4.4 Per-number send metrics surfaced to the control plane.

## 5. Onboarding & control plane

- [x] 5.1 Firecrawl site ingestion — Firecrawl API (FIRECRAWL_API_KEY) scrape
      endpoint + onboarding ingest. (verified live on firecrawl.dev)
- [x] 5.2 Business profile extraction — LLM structured profile from the scrape.
- [x] 5.3 Agent archetypes — company-info / personal / ecommerce / support /
      exporter; picked in the wizard, seeds persona + tools.
- [x] 5.4 Tool selection & enablement — wizard checkboxes + config editor.
- [x] 5.5 Product catalog extraction — scrape + LLM extract → `products` table.
      (verified: 20 products from a real store)
- [x] 5.6 Product availability tool — `check_availability` searches the catalog.
      (verified; reads the stored catalog — live re-fetch is a later enhancement)
- [x] 5.7 Rich outbound types — image / document / location + formatted product
      lists, sent via the tool "outbox". (native WhatsApp buttons/lists are
      unreliable on unofficial Baileys, so lists render as formatted text)
- [x] 5.8 Onboarding wizard UI + sandbox test — 4-step wizard + live sandbox chat.
- [x] 5.9 Owner dashboard — SWARION-styled control plane: stats, tenants, tenant
      detail (connection/pairing, config editor, knowledge ingest, activity).

## 6. Rich messaging

- [x] 6.1 Inbound media — event router recognizes image/video/audio/doc/location
      and gives the agent a note so it can respond.
- [x] 6.2 Outbound media — image / document / location via the tool outbox.
- [x] 6.3 Payment links — `send_payment_link` tool. (verified: link delivered via
      outbox; placeholder URL — wire a real provider per tenant later)
- [~] 6.4 Interactive types — product lists as formatted text (reliable); native
      WhatsApp buttons/lists are deprecated for unofficial clients.
- [ ] 6.5 Audio notes — Ogg/Opus transcode for voice replies.

## 7. Productize

- [ ] 7.1 Dockerfile + compose; Railway/Render deploy template.
- [ ] 7.2 Official Cloud API adapter behind the transport boundary.
- [ ] 7.3 Billing + managed hosting (per-number/month).
- [ ] 7.4 Per-vertical eval sets (accuracy regression).
- [ ] 7.5 Tests + CI.
