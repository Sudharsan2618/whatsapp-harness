-- Account roles: 'owner' manages their own bot (tenant); 'admin' is an operator who
-- can see and open every tenant. SSO users get a role the same way.
alter table users add column if not exists role text not null default 'owner';
