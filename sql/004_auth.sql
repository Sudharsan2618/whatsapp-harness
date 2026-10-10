-- WhatsApp session state. Losing this forces a tenant to re-link their number,
-- so it is the one store that must always be backed up.
create table wa_auth_creds (
  number_id uuid primary key references tenant_numbers(id) on delete cascade,
  creds text not null,
  updated_at timestamptz not null default now()
);

-- Signal protocol keys, one row per (category, item). Matches the
-- SignalKeyStore get(type, ids) / set(data) contract.
create table wa_signal_keys (
  number_id uuid not null references tenant_numbers(id) on delete cascade,
  category text not null,
  item_id text not null,
  value text not null,
  updated_at timestamptz not null default now(),
  primary key (number_id, category, item_id)
);
