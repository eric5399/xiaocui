-- Bearer links for H5 "no visible login" access. The raw token is never stored.
create table public.participant_access_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  token_hash text not null unique,
  status text not null default 'active' check (status in ('active','revoked','expired')),
  expires_at timestamptz not null default (now() + interval '30 days'),
  claimed_by uuid references auth.users(id) on delete set null,
  claimed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);
create index participant_access_links_task_idx on public.participant_access_links(task_id, status);
alter table public.participant_access_links enable row level security;
create policy participant_access_links_admin_select on public.participant_access_links for select using (public.is_org_admin(organization_id));
create policy participant_access_links_admin_write on public.participant_access_links for all using (public.is_org_admin(organization_id)) with check (public.is_org_admin(organization_id));

create or replace function public.claim_participant_access_link(raw_token text)
returns table(task_id uuid, invite_code text)
language plpgsql security definer set search_path = '' as $$
declare link public.participant_access_links;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
  select * into link from public.participant_access_links
    where token_hash = encode(digest(raw_token, 'sha256'), 'hex') for update;
  if link.id is null or link.status <> 'active' or link.expires_at <= now() then
    raise exception 'access link is invalid or expired' using errcode='42501';
  end if;
  if link.claimed_by is not null and link.claimed_by is distinct from auth.uid() then
    raise exception 'access link was already claimed' using errcode='42501';
  end if;
  insert into public.task_participants(task_id,user_id) values(link.task_id,auth.uid()) on conflict(task_id,user_id) do nothing;
  update public.participant_access_links set claimed_by=auth.uid(), claimed_at=coalesce(claimed_at,now()) where id=link.id;
  return query select task.id, task.invite_code from public.tasks task where task.id=link.task_id;
end;
$$;
revoke all on function public.claim_participant_access_link(text) from public;
grant execute on function public.claim_participant_access_link(text) to authenticated;
