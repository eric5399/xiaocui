-- Participants may correct only the derived Case/Rule that belongs to their own interview.
-- Original messages remain append-only; no cross-interview or expert-review authority is granted.
drop policy if exists cases_participant_update on public.extracted_cases;
create policy cases_participant_update
on public.extracted_cases
for update
using (public.is_interview_participant(interview_id))
with check (public.is_interview_participant(interview_id));

drop policy if exists rules_participant_update on public.experience_rules;
create policy rules_participant_update
on public.experience_rules
for update
using (
  exists (
    select 1
    from public.extracted_cases c
    where c.id = experience_rules.extracted_case_id
      and public.is_interview_participant(c.interview_id)
  )
)
with check (
  exists (
    select 1
    from public.extracted_cases c
    where c.id = experience_rules.extracted_case_id
      and public.is_interview_participant(c.interview_id)
  )
);
