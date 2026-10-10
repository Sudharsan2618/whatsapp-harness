-- Per-tenant product catalog (for e-commerce agents). Refreshed wholesale by
-- catalog extraction; searched by the availability tool.
create table products (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  sku text,
  name text not null,
  description text,
  price numeric(12, 2),
  currency text,
  in_stock boolean,
  url text,
  image_url text,
  content_tsv tsvector generated always as (
    to_tsvector('english', coalesce(name, '') || ' ' || coalesce(description, ''))
  ) stored,
  updated_at timestamptz not null default now()
);
create index on products (tenant_id);
create index on products using gin (content_tsv);

insert into tool_registry (key, name, description) values
  ('check_availability', 'Check availability', 'Check product availability and price from the catalog'),
  ('send_catalog',       'Send catalog',       'Send the customer a list of matching products'),
  ('send_image',         'Send product image', 'Send a product image to the customer'),
  ('send_payment_link',  'Send payment link',  'Generate and send a payment link')
on conflict (key) do nothing;
