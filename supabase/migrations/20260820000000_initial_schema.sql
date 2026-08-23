-- Institution Experience Extraction Agent - initial Supabase/PostgreSQL schema.
-- The two kinds of "case" are deliberately separate:
--   challenge_cases: synthetic prompts shown before an interview.
--   extracted_cases: evidence-backed cases extracted from an interview.

create extension if not exists pgcrypto;

create type public.scenario_status as enum ('draft', 'published', 'archived');
create type public.task_status as enum ('draft', 'active', 'closed', 'archived');
create type public.interview_status as enum ('in_progress', 'completed', 'abandoned');
create type public.fusion_status as enum ('pending', 'processing', 'completed', 'failed');
create type public.field_type as enum ('text', 'number', 'select');
create type public.message_role as enum ('system', 'assistant', 'user');
create type public.message_type as enum ('text', 'audio', 'system');

create table public.scenarios (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  topic text not null check (char_length(btrim(topic)) between 1 and 200),
  background text not null default '',
  objective text not null default '',
  agent_prompt text not null default '',
  keywords text[] not null default '{}',
  output_schema jsonb not null default '{}'::jsonb check (jsonb_typeof(output_schema) = 'object'),
  case_template jsonb not null default '{}'::jsonb check (jsonb_typeof(case_template) = 'object'),
  status public.scenario_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references public.scenarios(id) on delete cascade,
  invite_code varchar(24) not null unique check (invite_code ~ '^[A-Z0-9]{6,24}$'),
  -- Kept for compatibility with the PRD. Prefer deriving the QR from invite_code
  -- and PUBLIC_APP_URL so a deployment-domain change does not invalidate it.
  qr_code text,
  target_user text not null default '',
  expected_duration_minutes integer not null default 15 check (expected_duration_minutes between 1 and 180),
  status public.task_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.custom_fields (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references public.scenarios(id) on delete cascade,
  field_name text not null check (char_length(btrim(field_name)) between 1 and 60),
  field_type public.field_type not null,
  options jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array'),
  required boolean not null default false,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  unique (scenario_id, field_name),
  check (field_type = 'select' or jsonb_array_length(options) = 0)
);

create table public.user_profiles (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  profile_json jsonb not null default '{}'::jsonb check (jsonb_typeof(profile_json) = 'object'),
  created_at timestamptz not null default now(),
  unique (id, task_id)
);

create table public.challenge_cases (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  description text not null,
  case_data jsonb not null default '{}'::jsonb check (jsonb_typeof(case_data) = 'object'),
  source text not null default 'mock' check (source in ('mock', 'ai', 'manual')),
  created_at timestamptz not null default now(),
  unique (id, task_id)
);

create table public.interviews (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_profile_id uuid not null,
  challenge_case_id uuid not null,
  status public.interview_status not null default 'in_progress',
  extraction_state jsonb not null default '{}'::jsonb check (jsonb_typeof(extraction_state) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  foreign key (user_profile_id, task_id)
    references public.user_profiles(id, task_id) on delete restrict,
  foreign key (challenge_case_id, task_id)
    references public.challenge_cases(id, task_id) on delete restrict,
  check ((status = 'completed' and completed_at is not null) or status <> 'completed')
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  interview_id uuid not null references public.interviews(id) on delete cascade,
  role public.message_role not null,
  message_type public.message_type not null default 'text',
  content text not null default '',
  audio_url text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  check (content <> '' or audio_url is not null)
);

create table public.extracted_cases (
  id uuid primary key default gen_random_uuid(),
  interview_id uuid not null unique references public.interviews(id) on delete cascade,
  title text not null default '',
  summary text not null default '',
  background text not null default '',
  discovery text not null default '',
  judgement text not null default '',
  action text not null default '',
  result text not null default '',
  limitation text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.experience_rules (
  id uuid primary key default gen_random_uuid(),
  extracted_case_id uuid not null references public.extracted_cases(id) on delete cascade,
  condition text not null default '',
  judgement text not null default '',
  strategy text not null default '',
  limitation text not null default '',
  created_at timestamptz not null default now()
);

create table public.fusion_jobs (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references public.scenarios(id) on delete cascade,
  status public.fusion_status not null default 'pending',
  result jsonb check (result is null or jsonb_typeof(result) = 'object'),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (id, scenario_id),
  check ((status = 'completed' and result is not null and completed_at is not null) or status <> 'completed'),
  check ((status = 'failed' and error_message is not null) or status <> 'failed')
);

create table public.fusion_job_interviews (
  fusion_job_id uuid not null references public.fusion_jobs(id) on delete cascade,
  interview_id uuid not null references public.interviews(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (fusion_job_id, interview_id)
);

create table public.reference_files (
  id uuid primary key default gen_random_uuid(),
  fusion_job_id uuid not null unique references public.fusion_jobs(id) on delete cascade,
  filename text not null check (filename ~ '[.]md$'),
  markdown_content text not null,
  created_at timestamptz not null default now()
);

create index tasks_scenario_id_idx on public.tasks(scenario_id);
create index custom_fields_scenario_sort_idx on public.custom_fields(scenario_id, sort_order);
create index user_profiles_task_id_idx on public.user_profiles(task_id);
create index challenge_cases_task_id_idx on public.challenge_cases(task_id);
create index interviews_task_status_idx on public.interviews(task_id, status);
create index messages_interview_created_idx on public.messages(interview_id, created_at);
create index experience_rules_case_id_idx on public.experience_rules(extracted_case_id);
create index fusion_jobs_scenario_status_idx on public.fusion_jobs(scenario_id, status);
create index fusion_job_interviews_interview_idx on public.fusion_job_interviews(interview_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger scenarios_set_updated_at
before update on public.scenarios
for each row execute function public.set_updated_at();

create trigger tasks_set_updated_at
before update on public.tasks
for each row execute function public.set_updated_at();

create trigger interviews_set_updated_at
before update on public.interviews
for each row execute function public.set_updated_at();

create trigger extracted_cases_set_updated_at
before update on public.extracted_cases
for each row execute function public.set_updated_at();

create trigger fusion_jobs_set_updated_at
before update on public.fusion_jobs
for each row execute function public.set_updated_at();

create or replace function public.ensure_fusion_interview_same_scenario()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  job_scenario_id uuid;
  interview_scenario_id uuid;
begin
  select scenario_id into job_scenario_id
  from public.fusion_jobs
  where id = new.fusion_job_id;

  select tasks.scenario_id into interview_scenario_id
  from public.interviews
  join public.tasks on tasks.id = interviews.task_id
  where interviews.id = new.interview_id;

  if job_scenario_id is distinct from interview_scenario_id then
    raise exception 'Fusion job and interview must belong to the same scenario';
  end if;

  return new;
end;
$$;

create trigger fusion_job_interviews_same_scenario
before insert or update on public.fusion_job_interviews
for each row execute function public.ensure_fusion_interview_same_scenario();

-- All browser access goes through server Route Handlers. Service-role access bypasses
-- RLS; no anon/authenticated policies are created in this single-tenant MVP.
alter table public.scenarios enable row level security;
alter table public.tasks enable row level security;
alter table public.custom_fields enable row level security;
alter table public.user_profiles enable row level security;
alter table public.challenge_cases enable row level security;
alter table public.interviews enable row level security;
alter table public.messages enable row level security;
alter table public.extracted_cases enable row level security;
alter table public.experience_rules enable row level security;
alter table public.fusion_jobs enable row level security;
alter table public.fusion_job_interviews enable row level security;
alter table public.reference_files enable row level security;
