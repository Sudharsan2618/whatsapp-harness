-- Optional but recommended. The app sets the active tenant per transaction with
--   select set_config('app.current_tenant', '<tenant-uuid>', true);
-- and every query is then scoped to that tenant (use pool.withTenant() in code).
--
-- The policy is enforced only for non-owner roles; the table owner bypasses RLS.
-- To actually enforce isolation, run the application under a dedicated role that
-- does not own these tables and has no BYPASSRLS.

do $$
declare
  t text;
begin
  foreach t in array array[
    'tenant_config', 'tenant_numbers', 'tenant_tools',
    'messages', 'message_runs', 'handoffs',
    'customers', 'knowledge_documents', 'knowledge_chunks', 'usage_events'
  ]
  loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy tenant_isolation on %I
         using (tenant_id = current_setting(''app.current_tenant'', true)::uuid)
         with check (tenant_id = current_setting(''app.current_tenant'', true)::uuid)',
      t
    );
  end loop;
end $$;
