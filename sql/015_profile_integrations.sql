-- Store the extracted/edited business profile on the tenant, and register the
-- meeting-booking tool (Calendly etc.).
alter table tenants add column if not exists profile jsonb not null default '{}'::jsonb;

insert into tool_registry (key, name, description) values
  ('book_meeting', 'Book meeting', 'Share the owner''s meeting booking link (e.g. Calendly)')
on conflict (key) do nothing;
