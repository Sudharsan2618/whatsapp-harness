-- content holds the proto.IMessage, required by getMessage for retries and
-- poll-vote decryption.
create table messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  chat_jid text not null,
  msg_id text not null,
  from_me boolean not null default false,
  sender_jid text,
  kind text,
  content jsonb,
  text_preview text,
  ts timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id, chat_jid, msg_id)
);
create index on messages (tenant_id, chat_jid, ts desc);

-- One row per handled inbound message: how it was routed, for per-tenant
-- observability and accuracy evals.
create type run_route as enum ('info', 'action', 'handoff');

create table message_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  chat_jid text not null,
  msg_id text,
  intent text,
  route run_route,
  confidence real,
  handled_by text,
  latency_ms integer,
  created_at timestamptz not null default now()
);
create index on message_runs (tenant_id, created_at desc);

create type handoff_status as enum ('open', 'closed');

create table handoffs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  chat_jid text not null,
  status handoff_status not null default 'open',
  reason text,
  assigned_to text,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
create index on handoffs (tenant_id, status);
