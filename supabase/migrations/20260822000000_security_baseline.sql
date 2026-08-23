-- Security baseline for real institution data. This migration intentionally
-- denies browser access unless a Supabase Auth JWT maps to an organisation role
-- or an assigned task participant.

create type public.organization_member_role as enum ('admin', 'member');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.organization_member_role not null default 'member',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.task_participants (
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  user_profile_id uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (task_id, user_id),
  unique (user_profile_id)
);

insert into public.organizations (id, name)
values ('00000000-0000-4000-8000-000000000001', '演示机构')
on conflict (id) do nothing;

alter table public.scenarios add column if not exists organization_id uuid references public.organizations(id) on delete restrict;
alter table public.tasks add column if not exists organization_id uuid references public.organizations(id) on delete restrict;
alter table public.custom_fields add column if not exists organization_id uuid references public.organizations(id) on delete restrict;
alter table public.user_profiles add column if not exists organization_id uuid references public.organizations(id) on delete restrict;
alter table public.challenge_cases add column if not exists organization_id uuid references public.organizations(id) on delete restrict;
alter table public.interviews add column if not exists organization_id uuid references public.organizations(id) on delete restrict;
alter table public.messages add column if not exists organization_id uuid references public.organizations(id) on delete restrict;
alter table public.extracted_cases add column if not exists organization_id uuid references public.organizations(id) on delete restrict;
alter table public.experience_rules add column if not exists organization_id uuid references public.organizations(id) on delete restrict;
alter table public.fusion_jobs add column if not exists organization_id uuid references public.organizations(id) on delete restrict;
alter table public.reference_files add column if not exists organization_id uuid references public.organizations(id) on delete restrict;

alter table public.scenarios add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.scenarios add column if not exists updated_by uuid references auth.users(id) on delete set null;
alter table public.tasks add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.tasks add column if not exists updated_by uuid references auth.users(id) on delete set null;
alter table public.custom_fields add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.custom_fields add column if not exists updated_by uuid references auth.users(id) on delete set null;
alter table public.user_profiles add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.user_profiles add column if not exists updated_by uuid references auth.users(id) on delete set null;
alter table public.challenge_cases add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.challenge_cases add column if not exists updated_by uuid references auth.users(id) on delete set null;
alter table public.interviews add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.interviews add column if not exists updated_by uuid references auth.users(id) on delete set null;
alter table public.messages add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.messages add column if not exists updated_by uuid references auth.users(id) on delete set null;
alter table public.extracted_cases add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.extracted_cases add column if not exists updated_by uuid references auth.users(id) on delete set null;
alter table public.experience_rules add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.experience_rules add column if not exists updated_by uuid references auth.users(id) on delete set null;
alter table public.fusion_jobs add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.fusion_jobs add column if not exists updated_by uuid references auth.users(id) on delete set null;
alter table public.reference_files add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.reference_files add column if not exists updated_by uuid references auth.users(id) on delete set null;

-- Older MVP tables were append-only. Keep the same audit shape on every core
-- record so a production retention or investigation job has one vocabulary.
alter table public.custom_fields add column if not exists updated_at timestamptz not null default now();
alter table public.user_profiles add column if not exists updated_at timestamptz not null default now();
alter table public.challenge_cases add column if not exists updated_at timestamptz not null default now();
alter table public.messages add column if not exists updated_at timestamptz not null default now();
alter table public.experience_rules add column if not exists updated_at timestamptz not null default now();
alter table public.reference_files add column if not exists updated_at timestamptz not null default now();

update public.scenarios set organization_id = '00000000-0000-4000-8000-000000000001' where organization_id is null;
update public.tasks t set organization_id = s.organization_id from public.scenarios s where t.scenario_id = s.id and t.organization_id is null;
update public.custom_fields f set organization_id = s.organization_id from public.scenarios s where f.scenario_id = s.id and f.organization_id is null;
update public.user_profiles p set organization_id = t.organization_id from public.tasks t where p.task_id = t.id and p.organization_id is null;
update public.challenge_cases c set organization_id = t.organization_id from public.tasks t where c.task_id = t.id and c.organization_id is null;
update public.interviews i set organization_id = t.organization_id from public.tasks t where i.task_id = t.id and i.organization_id is null;
update public.messages m set organization_id = i.organization_id from public.interviews i where m.interview_id = i.id and m.organization_id is null;
update public.extracted_cases c set organization_id = i.organization_id from public.interviews i where c.interview_id = i.id and c.organization_id is null;
update public.experience_rules r set organization_id = c.organization_id from public.extracted_cases c where r.extracted_case_id = c.id and r.organization_id is null;
update public.fusion_jobs f set organization_id = s.organization_id from public.scenarios s where f.scenario_id = s.id and f.organization_id is null;
update public.reference_files r set organization_id = f.organization_id from public.fusion_jobs f where r.fusion_job_id = f.id and r.organization_id is null;

alter table public.scenarios alter column organization_id set not null;
alter table public.tasks alter column organization_id set not null;
alter table public.custom_fields alter column organization_id set not null;
alter table public.user_profiles alter column organization_id set not null;
alter table public.challenge_cases alter column organization_id set not null;
alter table public.interviews alter column organization_id set not null;
alter table public.messages alter column organization_id set not null;
alter table public.extracted_cases alter column organization_id set not null;
alter table public.experience_rules alter column organization_id set not null;
alter table public.fusion_jobs alter column organization_id set not null;
alter table public.reference_files alter column organization_id set not null;

create index if not exists scenarios_organization_id_idx on public.scenarios(organization_id);
create index if not exists tasks_organization_id_idx on public.tasks(organization_id);
create index if not exists interviews_organization_id_idx on public.interviews(organization_id);
create index if not exists messages_organization_id_idx on public.messages(organization_id);
create index if not exists task_participants_user_id_idx on public.task_participants(user_id);

create or replace function public.assign_organization_from_parent()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_table_name = 'tasks' then
    select organization_id into new.organization_id from public.scenarios where id = new.scenario_id;
  elsif tg_table_name = 'custom_fields' then
    select organization_id into new.organization_id from public.scenarios where id = new.scenario_id;
  elsif tg_table_name in ('user_profiles', 'challenge_cases', 'interviews') then
    select organization_id into new.organization_id from public.tasks where id = new.task_id;
  elsif tg_table_name = 'messages' then
    select organization_id into new.organization_id from public.interviews where id = new.interview_id;
  elsif tg_table_name = 'extracted_cases' then
    select organization_id into new.organization_id from public.interviews where id = new.interview_id;
  elsif tg_table_name = 'experience_rules' then
    select organization_id into new.organization_id from public.extracted_cases where id = new.extracted_case_id;
  elsif tg_table_name = 'fusion_jobs' then
    select organization_id into new.organization_id from public.scenarios where id = new.scenario_id;
  elsif tg_table_name = 'reference_files' then
    select organization_id into new.organization_id from public.fusion_jobs where id = new.fusion_job_id;
  end if;
  if new.organization_id is null then raise exception 'organization_id could not be derived'; end if;
  return new;
end;
$$;

create or replace function public.set_audit_actor()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'INSERT' and new.created_by is null then new.created_by = auth.uid(); end if;
  new.updated_by = auth.uid();
  return new;
end;
$$;

create or replace function public.set_updated_at_and_actor()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end;
$$;

-- A participant is assigned to a task before they submit their profile. Bind
-- that first profile atomically so subsequent interview/message RLS can prove
-- ownership without trusting a client-provided profile id.
create or replace function public.bind_task_participant_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Seed and controlled server-side backfills do not have a caller JWT.
  if auth.uid() is null then return new; end if;
  update public.task_participants
  set user_profile_id = new.id, updated_at = now()
  where task_id = new.task_id and user_id = auth.uid() and user_profile_id is null;
  if not found then
    raise exception 'no unbound task participant assignment exists for current user';
  end if;
  return new;
end;
$$;

drop trigger if exists scenarios_set_updated_at on public.scenarios;
drop trigger if exists tasks_set_updated_at on public.tasks;
drop trigger if exists interviews_set_updated_at on public.interviews;
drop trigger if exists extracted_cases_set_updated_at on public.extracted_cases;
drop trigger if exists fusion_jobs_set_updated_at on public.fusion_jobs;
create trigger scenarios_set_updated_at before update on public.scenarios for each row execute function public.set_updated_at_and_actor();
create trigger tasks_set_updated_at before update on public.tasks for each row execute function public.set_updated_at_and_actor();
create trigger interviews_set_updated_at before update on public.interviews for each row execute function public.set_updated_at_and_actor();
create trigger extracted_cases_set_updated_at before update on public.extracted_cases for each row execute function public.set_updated_at_and_actor();
create trigger fusion_jobs_set_updated_at before update on public.fusion_jobs for each row execute function public.set_updated_at_and_actor();
create trigger custom_fields_set_updated_at before update on public.custom_fields for each row execute function public.set_updated_at_and_actor();
create trigger user_profiles_set_updated_at before update on public.user_profiles for each row execute function public.set_updated_at_and_actor();
create trigger challenge_cases_set_updated_at before update on public.challenge_cases for each row execute function public.set_updated_at_and_actor();
create trigger messages_set_updated_at before update on public.messages for each row execute function public.set_updated_at_and_actor();
create trigger experience_rules_set_updated_at before update on public.experience_rules for each row execute function public.set_updated_at_and_actor();
create trigger reference_files_set_updated_at before update on public.reference_files for each row execute function public.set_updated_at_and_actor();
create trigger organizations_set_updated_at before update on public.organizations for each row execute function public.set_updated_at_and_actor();
create trigger organization_members_set_updated_at before update on public.organization_members for each row execute function public.set_updated_at_and_actor();
create trigger task_participants_set_updated_at before update on public.task_participants for each row execute function public.set_updated_at_and_actor();

create trigger tasks_assign_organization before insert on public.tasks for each row execute function public.assign_organization_from_parent();
create trigger custom_fields_assign_organization before insert on public.custom_fields for each row execute function public.assign_organization_from_parent();
create trigger user_profiles_assign_organization before insert on public.user_profiles for each row execute function public.assign_organization_from_parent();
create trigger user_profiles_bind_participant after insert on public.user_profiles for each row execute function public.bind_task_participant_profile();
create trigger challenge_cases_assign_organization before insert on public.challenge_cases for each row execute function public.assign_organization_from_parent();
create trigger interviews_assign_organization before insert on public.interviews for each row execute function public.assign_organization_from_parent();
create trigger messages_assign_organization before insert on public.messages for each row execute function public.assign_organization_from_parent();
create trigger extracted_cases_assign_organization before insert on public.extracted_cases for each row execute function public.assign_organization_from_parent();
create trigger experience_rules_assign_organization before insert on public.experience_rules for each row execute function public.assign_organization_from_parent();
create trigger fusion_jobs_assign_organization before insert on public.fusion_jobs for each row execute function public.assign_organization_from_parent();
create trigger reference_files_assign_organization before insert on public.reference_files for each row execute function public.assign_organization_from_parent();

create trigger scenarios_set_audit_actor before insert on public.scenarios for each row execute function public.set_audit_actor();
create trigger tasks_set_audit_actor before insert on public.tasks for each row execute function public.set_audit_actor();
create trigger custom_fields_set_audit_actor before insert on public.custom_fields for each row execute function public.set_audit_actor();
create trigger user_profiles_set_audit_actor before insert on public.user_profiles for each row execute function public.set_audit_actor();
create trigger challenge_cases_set_audit_actor before insert on public.challenge_cases for each row execute function public.set_audit_actor();
create trigger interviews_set_audit_actor before insert on public.interviews for each row execute function public.set_audit_actor();
create trigger messages_set_audit_actor before insert on public.messages for each row execute function public.set_audit_actor();
create trigger extracted_cases_set_audit_actor before insert on public.extracted_cases for each row execute function public.set_audit_actor();
create trigger experience_rules_set_audit_actor before insert on public.experience_rules for each row execute function public.set_audit_actor();
create trigger fusion_jobs_set_audit_actor before insert on public.fusion_jobs for each row execute function public.set_audit_actor();
create trigger reference_files_set_audit_actor before insert on public.reference_files for each row execute function public.set_audit_actor();

create or replace function public.is_org_member(target_organization_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.organization_members where organization_id = target_organization_id and user_id = auth.uid());
$$;

create or replace function public.is_org_admin(target_organization_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.organization_members where organization_id = target_organization_id and user_id = auth.uid() and role = 'admin');
$$;

create or replace function public.is_task_participant(target_task_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.task_participants where task_id = target_task_id and user_id = auth.uid());
$$;

create or replace function public.is_interview_participant(target_interview_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.interviews i join public.task_participants p on p.task_id = i.task_id
    where i.id = target_interview_id and p.user_id = auth.uid() and p.user_profile_id = i.user_profile_id
  );
$$;

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.task_participants enable row level security;

create policy organizations_member_select on public.organizations for select using (public.is_org_member(id));
create policy organization_members_self_select on public.organization_members for select using (user_id = auth.uid());
create policy task_participants_self_select on public.task_participants for select using (user_id = auth.uid());

create policy scenarios_member_or_participant_select on public.scenarios for select using (
  public.is_org_member(organization_id)
  or exists (select 1 from public.tasks t where t.scenario_id = scenarios.id and public.is_task_participant(t.id))
);
create policy scenarios_admin_write on public.scenarios for all using (public.is_org_admin(organization_id)) with check (public.is_org_admin(organization_id));
create policy tasks_member_select on public.tasks for select using (public.is_org_member(organization_id) or public.is_task_participant(id));
create policy tasks_admin_write on public.tasks for all using (public.is_org_admin(organization_id)) with check (public.is_org_admin(organization_id));
create policy fields_member_or_participant_select on public.custom_fields for select using (public.is_org_member(organization_id) or public.is_task_participant((select id from public.tasks where scenario_id = custom_fields.scenario_id limit 1)));
create policy fields_admin_write on public.custom_fields for all using (public.is_org_admin(organization_id)) with check (public.is_org_admin(organization_id));
create policy challenge_member_or_participant_select on public.challenge_cases for select using (public.is_org_member(organization_id) or public.is_task_participant(task_id));
create policy challenge_admin_write on public.challenge_cases for all using (public.is_org_admin(organization_id)) with check (public.is_org_admin(organization_id));
create policy profiles_member_or_self on public.user_profiles for select using (public.is_org_member(organization_id) or exists (select 1 from public.task_participants p where p.task_id = user_profiles.task_id and p.user_id = auth.uid() and p.user_profile_id = user_profiles.id));
create policy profiles_participant_insert on public.user_profiles for insert with check (
  public.is_task_participant(task_id)
  and exists (select 1 from public.task_participants p where p.task_id = user_profiles.task_id and p.user_id = auth.uid() and p.user_profile_id is null)
);
create policy interviews_member_or_self on public.interviews for select using (public.is_org_member(organization_id) or public.is_interview_participant(id));
create policy interviews_participant_insert on public.interviews for insert with check (public.is_task_participant(task_id) and exists (select 1 from public.task_participants p where p.task_id = interviews.task_id and p.user_id = auth.uid() and p.user_profile_id = interviews.user_profile_id));
create policy interviews_participant_update on public.interviews for update using (public.is_interview_participant(id)) with check (public.is_interview_participant(id));
create policy messages_member_or_self on public.messages for select using (public.is_org_member(organization_id) or public.is_interview_participant(interview_id));
create policy messages_participant_insert on public.messages for insert with check (public.is_interview_participant(interview_id));
create policy cases_member_or_self on public.extracted_cases for select using (public.is_org_member(organization_id) or public.is_interview_participant(interview_id));
create policy cases_participant_insert on public.extracted_cases for insert with check (public.is_interview_participant(interview_id));
create policy rules_member_or_self on public.experience_rules for select using (public.is_org_member(organization_id) or exists (select 1 from public.extracted_cases c where c.id = experience_rules.extracted_case_id and public.is_interview_participant(c.interview_id)));
create policy rules_participant_insert on public.experience_rules for insert with check (exists (select 1 from public.extracted_cases c where c.id = experience_rules.extracted_case_id and public.is_interview_participant(c.interview_id)));
create policy fusion_member_select on public.fusion_jobs for select using (public.is_org_member(organization_id));
create policy fusion_admin_write on public.fusion_jobs for all using (public.is_org_admin(organization_id)) with check (public.is_org_admin(organization_id));
create policy references_member_select on public.reference_files for select using (public.is_org_member(organization_id));
create policy references_admin_write on public.reference_files for all using (public.is_org_admin(organization_id)) with check (public.is_org_admin(organization_id));
create policy fusion_links_member_select on public.fusion_job_interviews for select using (exists (select 1 from public.fusion_jobs f where f.id = fusion_job_interviews.fusion_job_id and public.is_org_member(f.organization_id)));
create policy fusion_links_admin_write on public.fusion_job_interviews for all using (exists (select 1 from public.fusion_jobs f where f.id = fusion_job_interviews.fusion_job_id and public.is_org_admin(f.organization_id))) with check (exists (select 1 from public.fusion_jobs f where f.id = fusion_job_interviews.fusion_job_id and public.is_org_admin(f.organization_id)));

-- Retention and deletion are enforced operationally until a scheduled worker is added:
-- audio: private object storage, default 30 days after interview completion;
-- transcript / profile / customer data: default 365 days, then anonymize or delete;
-- approved Reference files: retain per institution policy and legal hold.
