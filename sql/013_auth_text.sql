-- Auth state is serialized by the app with BufferJSON; store it as text so the
-- database never parses it as JSON (jsonb rejected some Signal key encodings).
alter table wa_auth_creds alter column creds type text using creds::text;
alter table wa_signal_keys alter column value type text using value::text;
