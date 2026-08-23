-- Security baseline installs updated_at/actor triggers on membership tables.
-- These columns were missing, causing profile binding to fail at runtime.

alter table public.organization_members
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null;

alter table public.task_participants
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null;
