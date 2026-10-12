-- Application accounts (the people who sign in to the console) and their sessions.
-- Password sign-in is one identity method; SSO/Auth0 can later create users and
-- sessions through the same tables (password_hash stays null for SSO-only users).

create table if not exists users (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique,
  name          text,
  password_hash text,
  tenant_id     uuid references tenants(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists sessions (
  token      text primary key,
  user_id    uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists sessions_user_idx on sessions(user_id);
create index if not exists users_tenant_idx on users(tenant_id);
