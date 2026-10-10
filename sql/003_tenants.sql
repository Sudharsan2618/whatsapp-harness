create type tenant_status as enum ('onboarding', 'active', 'paused', 'suspended');
create type number_auth_status as enum ('unlinked', 'linking', 'linked', 'logged_out');

create table tenants (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  business_name text not null,
  vertical text references vertical_packs(key),
  status tenant_status not null default 'onboarding',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Per-tenant overrides, merged over platform_defaults + the vertical pack.
create table tenant_config (
  tenant_id uuid primary key references tenants(id) on delete cascade,
  overrides jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- One WhatsApp number per row; worker_id is the current lease holder.
create table tenant_numbers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  phone_e164 text unique not null,
  display_name text,
  auth_status number_auth_status not null default 'unlinked',
  worker_id text,
  lease_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on tenant_numbers (tenant_id);
create index on tenant_numbers (worker_id);

create table tenant_tools (
  tenant_id uuid not null references tenants(id) on delete cascade,
  tool_key text not null references tool_registry(key),
  enabled boolean not null default true,
  credentials jsonb, -- store ciphertext in production (per-tenant envelope encryption)
  primary key (tenant_id, tool_key)
);
