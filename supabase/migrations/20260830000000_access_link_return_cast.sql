create or replace function public.claim_participant_access_link(raw_token text)
returns table(task_id uuid, invite_code text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare link public.participant_access_links;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
  select * into link from public.participant_access_links as access_link where access_link.token_hash=encode(extensions.digest(raw_token,'sha256'),'hex') for update;
  if link.id is null or link.status <> 'active' or link.expires_at <= now() then raise exception 'access link is invalid or expired' using errcode='42501'; end if;
  if link.claimed_by is not null and link.claimed_by is distinct from auth.uid() then raise exception 'access link was already claimed' using errcode='42501'; end if;
  insert into public.task_participants as participant(task_id,user_id) values(link.task_id,auth.uid()) on conflict(task_id,user_id) do nothing;
  update public.participant_access_links as access_link set claimed_by=auth.uid(),claimed_at=coalesce(access_link.claimed_at,now()) where access_link.id=link.id;
  return query select task_row.id,task_row.invite_code::text from public.tasks as task_row where task_row.id=link.task_id;
end;
$$;
