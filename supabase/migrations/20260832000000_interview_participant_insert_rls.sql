-- Keep the INSERT policy independent from visibility policies on
-- task_participants. The function proves the caller owns the exact profile
-- bound to the task, while the policy never trusts a client-supplied actor.
create or replace function public.can_create_task_interview(target_task_id uuid, target_profile_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.task_participants p
    where p.task_id = target_task_id
      and p.user_id = auth.uid()
      and p.user_profile_id = target_profile_id
  );
$$;

drop policy if exists interviews_participant_insert on public.interviews;
create policy interviews_participant_insert on public.interviews
for insert with check (public.can_create_task_interview(task_id, user_profile_id));
