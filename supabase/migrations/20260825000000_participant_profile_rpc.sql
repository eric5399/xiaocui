-- Create a participant profile atomically under the caller's JWT. Direct
-- inserts remain RLS-protected; this narrowly scoped function avoids fragile
-- cross-table policy evaluation during the first profile bind.

create or replace function public.create_current_participant_profile(
  input_task_id uuid,
  input_profile_json jsonb
)
returns table (
  id uuid,
  task_id uuid,
  profile_json jsonb,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_profile public.user_profiles;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.task_participants participant
    where participant.task_id = input_task_id
      and participant.user_id = auth.uid()
      and participant.user_profile_id is null
  ) then
    raise exception 'participant assignment is missing or profile is already bound' using errcode = '42501';
  end if;

  insert into public.user_profiles (task_id, profile_json)
  values (input_task_id, input_profile_json)
  returning * into created_profile;

  return query select created_profile.id, created_profile.task_id,
    created_profile.profile_json, created_profile.created_at;
end;
$$;

revoke all on function public.create_current_participant_profile(uuid, jsonb) from public;
grant execute on function public.create_current_participant_profile(uuid, jsonb) to authenticated;
