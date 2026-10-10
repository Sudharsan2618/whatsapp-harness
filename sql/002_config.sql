-- Platform-wide defaults. One row; the base layer every tenant inherits.
create table platform_defaults (
  id boolean primary key default true,
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint platform_defaults_singleton check (id)
);

-- A reusable template per domain (clinic, law_firm, salon ...).
create table vertical_packs (
  key text primary key,
  name text not null,
  description text,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Global catalogue of capabilities a tenant can enable.
create table tool_registry (
  key text primary key,
  name text not null,
  description text,
  input_schema jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
