create type knowledge_status as enum ('pending', 'approved', 'rejected');
create type knowledge_source as enum ('upload', 'crawl', 'manual');

-- A source document the owner has ingested; only approved docs are retrievable.
create table knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  source knowledge_source not null,
  source_ref text,
  title text,
  status knowledge_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on knowledge_documents (tenant_id, status);

-- Retrieval filters by tenant_id first (the per-tenant namespace), then by
-- vector similarity. Set the embedding dimension to match your model.
create table knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  document_id uuid not null references knowledge_documents(id) on delete cascade,
  content text not null,
  embedding vector(1536),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on knowledge_chunks (tenant_id);
create index on knowledge_chunks using hnsw (embedding vector_cosine_ops);
