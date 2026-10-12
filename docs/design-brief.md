# Design brief — WhatsApp AI Agent SaaS (customer console)

> Paste this into Claude Design (the `impeccable` skill). Treat it as an **Operate**-mode
> product (a tool people use to run their bot), not a marketing site. This brief is
> self-contained — the complete design system is specified below; there are no external
> references. This is a redesign of the information architecture and screens, keeping the
> visual language defined here.

## Design system (use exactly this — the only source of truth)

A clean, calm, Asana-like productivity aesthetic: white canvas, one soft gray surface for
chrome, a single blue brand accent, generous breathing room, subtle borders over heavy
shadows. Light mode only.

**Type**
- Sans (everything): `Figtree` (Google Fonts), weights 300–900. Fallback
  `-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`.
- Mono (codes/numbers like a pairing code): `JetBrains Mono`.
- Base body 14px. Scale in use: page title 18/700, card title 14/700, stat value 24/700,
  section label 11/700 uppercase +0.5px tracking, body 13–14, hint 11.5 in text-3.

**Color tokens**
- Background `#FFFFFF`; surface (sidebar, inputs-bg, chips) `#F6F5F5`; hover `#EFEFEF`;
  row-hover `#FAFAFA`.
- Text: primary `#1E1F21`, secondary `#6D6E6F`, tertiary `#9B9B9B`.
- Border `#E8E8E8`; stronger border `#CECECE`.
- Brand `#4573D2`; brand-hover `#3660BD`; brand-subtle `#EEF4FF`; brand-text `#2C4A88`;
  brand-tint `rgba(69,115,210,0.10)` (active nav / selected).
- Success `#5AC87C` / bg `#D3F2E4` / text `#0D7358`. Warning bg `#FFF0D8` / text `#C46704`.
  Danger `#F06A6A` / bg `#FFE0E0` / text `#D32F2F`.

**Shape & depth**
- Radii: sm 5px, md 7px (buttons, inputs), lg 10px (cards), full 9999px (pills/badges/chips).
- Shadows are subtle: sm `0 1px 3px rgba(0,0,0,.08)`, md `0 4px 12px rgba(0,0,0,.10)`,
  focus ring `0 0 0 3px brand-tint`. Prefer 1px borders over shadows for structure.

**Layout**
- Full-width top appbar (50px): brand mark + name at left over a 242px column, centered
  search, avatar at right.
- Left sidebar 242px on the gray surface; nav items are 7px-radius rows, 500 weight, icon +
  label; **active item uses brand-tint background with brand-color text/icon**; hover is the
  hover-gray. Optional uppercase group labels in text-3.
- Main area white, scrollable, with a sticky page header (title 18/700, actions right-aligned)
  and 24px content padding; content max-width ~1180px, narrow forms centered at ~760px.

**Components (reuse this vocabulary)**
- **Card**: white, 1px border, 10px radius; header (title + sub + optional action) divided
  from a 20px body. Stack with 16px gaps; 2- and 4-up responsive grids.
- **Stat tile**: label (uppercase, text-2) + 24px value.
- **Buttons**: primary (brand fill, white), secondary (transparent, strong border, hover
  gray), ghost; 34px tall, md radius, 600 weight; `sm` = 28px.
- **Forms**: uppercase 11px labels; inputs/selects/textarea with strong border, md radius,
  brand focus ring; hint text in text-3.
- **Badges/pills**: full radius, 11/700; green/amber/red/gray/blue variants from the tokens
  (use for status: Live=green, Connecting=amber, Not connected=gray/red).
- **Chips**: surface pill with border for tags/services/socials; brand variant available.
- **Tables**: uppercase 10.5px header, 1px row dividers, row-hover tint, clickable rows.
- **Read view + edit toggle**: show fields as a definition list (`dt` in text-3, `dd` in
  text-1) with an "Edit" button that swaps the block into a form; this is the core pattern
  for every profile/settings surface.
- **Wizard steps**: pill steps with number badges; active = brand-subtle, done = success.
- **Option cards / checkboxes**: selectable cards and checks that go brand-subtle when chosen
  (for archetype pick and skill toggles).
- **Chat bubbles**: user = brand fill right-aligned, bot = surface left-aligned (sandbox).
- **Empty state**: centered, text-2, generous padding. **Spinner**: 2px brand ring.
- **Pairing code**: large mono, letter-spaced, on brand-subtle, centered.
- **Toast**: dark pill, bottom-right.

Keep it quiet and legible; let whitespace and the single blue accent do the work.

## What the product is

A SaaS where a small business connects its own WhatsApp number to an AI agent that answers
customers using the business's website knowledge, tools (booking, catalog, payments,
human handoff), and persona. The business owner logs in and manages **their own single bot** —
they never see other businesses' bots. This is the **customer console**, not an internal
admin/ops view.

## The person using it

A non-technical small-business owner (clinic, institute, shop, exporter, agency). They care
about: "Is my bot live? What is it saying? What does it know? How do I make it better? How
do I connect my tools?" They do **not** know or care about chunks, embeddings, vector
stores, tenant IDs, model token counts, or message IDs.

## Hard rules — never show the end user

- Internal counts and plumbing: "8 chunks / 12 chunks", document IDs, tenant UUIDs, worker
  IDs, message IDs, raw status enums (`linking`, `logged_out`), raw JSON config, provider
  model strings like `openai/gpt-6-luna`.
- Replace them with human language: a knowledge source is "a page the bot learned from"
  (show the page title + link + when it was added), connection state is "Live / Not
  connected / Connecting", etc.
- Model choice, temperature, retrieval top-K and similar are **advanced settings** — hidden
  by default behind an "Advanced" disclosure, phrased in plain terms.

## Overall shape

Left nav (for a single logged-in business), each item is its own screen — do **not** cram
everything onto one page like the current tenant screen:

1. **Overview** — is the bot live, today at a glance, what needs attention.
2. **Agent** — who the bot is and how it behaves.
3. **Knowledge** — what the bot knows.
4. **Catalog** — products/services the bot can quote (only for commerce bots).
5. **Conversations** — recent chats + handoffs needing a human.
6. **WhatsApp** — connection + editable WhatsApp profile.
7. **Integrations** — connect external systems (separate, dedicated section).
8. **Settings** — account, plan/billing, team (future).

First-run: if no bot is configured yet, the whole console is replaced by a guided
**setup flow** (below). Once configured, the nav above appears.

## Screen specs

### First-run setup (activation)
A focused, centered, multi-step flow (not the full nav). Steps:
1. **Website** — business name + website URL. Copy explains we'll scan the site.
2. **Review what we found** — the agent scanned the site and auto-filled a profile. Show
   name, about, location, contact, services, and the **social links** it found. Also show a
   quiet, friendly line like "Scanned your site and picked the N pages worth learning from,
   skipping blogs and system pages" — as reassurance, **not** as a list of URLs with chunk
   counts. Everything editable.
3. **Agent type** — pick an archetype (Company info / Personal assistant / E-commerce /
   Support / Exporter) shown as friendly cards; this sets sensible defaults.
4. **Connect WhatsApp** — pairing-code flow (see WhatsApp screen). On success → Overview.

### Overview
- Big status: **Live** (green) / **Not connected** / **Connecting**. If not connected, a
  primary CTA to connect.
- Snapshot cards for a chosen range (today/7d): conversations handled, messages, how many
  needed a human (handoffs), avg response time — all in plain numbers, no token/latency jargon.
- "Needs your attention": open handoffs (customer waiting for a human) as actionable rows.
- Quick "Test your bot" entry to the sandbox.

### Agent
How the bot behaves, in friendly sections with the read-view + edit-toggle pattern:
- **Identity**: bot name, tone, languages.
- **Instructions**: a plain-language "how should it behave / what should it never do"
  (maps to persona extra + guardrails: must-refuse, disclaimers, when to escalate) — written
  as helpful prompts, not schema fields.
- **Skills**: the tools as friendly toggles with descriptions — Book a meeting, Take an
  appointment, Look up a customer, Check availability, Send catalog, Send product image,
  Send payment link, Hand off to a human. Never show raw tool keys.
- **Advanced** (collapsed): model provider/model, temperature, retrieval settings — plain labels.

### Knowledge
- "What your bot has learned" — a clean list of **sources** (page title + link + date added),
  **no chunk counts, no IDs, no status enums**. A simple "Learned / Processing" chip at most.
- Actions: **Add a website/page** (re-scan or add a URL), **Upload a document**, remove a source.
- Empty state: invite to add the website.

### Catalog (commerce bots only)
- Product cards: image, name, price, in-stock. Actions: refresh from a products page, edit.
- Hidden otherwise.

### Conversations
- Recent conversations list (customer name/number, last message, bot vs human, time).
- **Handoffs** prominently: chats a human needs to take over, with a "Reply / Resume bot"
  action. (Full shared-inbox is future — design the entry point and the single-thread view.)
- No message IDs or routes shown; use "Answered by bot / Handed to you" language.

### WhatsApp (connection + profile)
Two parts:
- **Connection**: status, the pairing-code link flow (enter number → show formatted code →
  "waiting… → Linked"), and disconnect. Make the waiting state patient and clear.
- **WhatsApp profile — editable (syncs to WhatsApp):** profile **photo** (upload/remove),
  **display name**, **about/status** text. These push to WhatsApp live.
- **WhatsApp Business card — read-only:** business name, hours, category, address, email,
  website as they appear on WhatsApp Business, with a note: "To change these, edit them in
  the WhatsApp Business app." Design this clearly as view-only so we never imply we can save it.
- Keep the **business profile that trains the bot** (Agent/Knowledge) visually separate from
  the **WhatsApp profile card**, so the user understands one shapes answers and the other is
  their WhatsApp identity.

### Integrations (dedicated section)
A gallery of integration cards, each connect/disconnect with status:
- **Booking** (Calendly or similar) — paste link; enables the booking skill.
- **Payments** (Razorpay) — connect keys or a hosted checkout page; enables payment links.
- **Social links** — the socials found during onboarding, editable; the bot can share them.
- Placeholders for future: Google Calendar, CRM, Google Business (hours), Sheets, webhooks.
Design it to scale to many integrations (searchable gallery, "Connected" vs "Available").

### Settings
Account, plan & billing, team members (future), danger zone (delete bot). Design the frames.

## States to design
Empty/not-configured, connecting, live, syncing knowledge, error/disconnected, loading.
Every screen should have a considered empty and error state.

## Out of scope / notes for the designer
- **Auth/login** (email + password or SSO) is assumed by this product but not yet built — please
  design Login, Sign-up, and the post-signup handoff into first-run setup.
- One account manages one bot in v1; design with that mental model (no tenant switcher).
- Ground every control in a real capability listed above; do not invent features.
