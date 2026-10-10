-- Full-text retrieval over knowledge chunks (v1; vector search is layered later).
alter table knowledge_chunks
  add column content_tsv tsvector generated always as (to_tsvector('english', content)) stored;

create index on knowledge_chunks using gin (content_tsv);
