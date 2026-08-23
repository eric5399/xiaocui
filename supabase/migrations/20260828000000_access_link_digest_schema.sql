create or replace function public.claim_participant_access_link(raw_token text)
returns table(task_id uuid, invite_code text)
language plpgsql security definer set search_path = '' as $$
declare link public.participant_access_links;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
  select * into link from public.participant_access_links
    where token_hash = encode(extensions.digest(raw_token, 'sha256'), 'hex') for update;
  if link.id is null or link.status <> 'active' or link.expires_at <= now() then raise exception 'access link is invalid or expired' using errcode='42501'; end if;
  if link.claimed_by is not null and link.claimed_by is distinct from auth.uid() then raise exception 'access link was already claimed' using errcode='42501'; end if;
  insert into public.task_participants(task_id,user_id) values(link.task_id,auth.uid()) on conflict(task_id,user_id) do nothing;
  update public.participant_access_links set claimed_by=auth.uid(), claimed_at=coalesce(claimed_at,now()) where id=link.id;
  return query select task.id,task.invite_code from public.tasks task where task.id=link.task_id;
end;
$$;
