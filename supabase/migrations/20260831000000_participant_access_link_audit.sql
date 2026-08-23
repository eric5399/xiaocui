-- Access links are security-sensitive records too: keep the same actor/time
-- vocabulary and automatic audit trigger as the core interview tables.
alter table public.participant_access_links
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by uuid references auth.users(id) on delete set null;

drop trigger if exists participant_access_links_set_audit_actor on public.participant_access_links;
create trigger participant_access_links_set_audit_actor
before insert on public.participant_access_links
for each row execute function public.set_audit_actor();

drop trigger if exists participant_access_links_set_updated_at on public.participant_access_links;
create trigger participant_access_links_set_updated_at
before update on public.participant_access_links
for each row execute function public.set_updated_at_and_actor();
