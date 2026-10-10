-- One record per end-customer of a tenant. profile accumulates learned facts,
-- tags and preferences (the "customer-aware" context).
create table customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  wa_lid text,
  wa_pn text,
  display_name text,
  profile jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (tenant_id, wa_lid)
);
create index on customers (tenant_id, wa_pn);
