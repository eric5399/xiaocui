-- LLM generation lifecycle is persisted separately from the user-authored
-- interview content. Outputs remain pending human review by default.
alter table public.interviews
  add column if not exists generation_status text not null default 'pending_review'
    check (generation_status in ('pending_review', 'failed')),
  add column if not exists generation_error text,
  add column if not exists generation_metadata jsonb not null default '{}'::jsonb;

create index if not exists interviews_generation_status_idx on public.interviews (organization_id, generation_status);
