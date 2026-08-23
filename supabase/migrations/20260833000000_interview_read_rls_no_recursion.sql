-- The previous SELECT policy called is_interview_participant(id), which reads
-- interviews again while PostgREST evaluates INSERT ... RETURNING. Use the
-- current row instead, so an assigned participant can receive their newly
-- inserted row without recursive RLS evaluation.
drop policy if exists interviews_member_or_self on public.interviews;
create policy interviews_member_or_self on public.interviews
for select using (
  public.is_org_member(organization_id)
  or exists (
    select 1 from public.task_participants p
    where p.task_id = interviews.task_id
      and p.user_id = auth.uid()
      and p.user_profile_id = interviews.user_profile_id
  )
);

drop policy if exists interviews_participant_update on public.interviews;
create policy interviews_participant_update on public.interviews
for update using (
  public.is_org_member(organization_id)
  or exists (
    select 1 from public.task_participants p
    where p.task_id = interviews.task_id
      and p.user_id = auth.uid()
      and p.user_profile_id = interviews.user_profile_id
  )
)
with check (
  public.is_org_member(organization_id)
  or exists (
    select 1 from public.task_participants p
    where p.task_id = interviews.task_id
      and p.user_id = auth.uid()
      and p.user_profile_id = interviews.user_profile_id
  )
);
