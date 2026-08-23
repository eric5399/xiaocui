-- Private audio and ASR job records. Audio objects are never public URLs;
-- messages retain only an opaque `storage://interview-audio/<path>` reference.

alter type public.message_type add value if not exists 'audio_transcript';

create type public.speech_transcript_status as enum (
  'uploaded', 'transcribing', 'completed', 'failed', 'expired'
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'interview-audio',
  'interview-audio',
  false,
  26214400,
  array['audio/wav', 'audio/x-wav', 'audio/pcm', 'audio/webm', 'audio/ogg', 'audio/mp4']
)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table public.speech_transcripts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  interview_id uuid not null references public.interviews(id) on delete cascade,
  storage_path text not null unique check (storage_path !~ '^https?://'),
  provider text not null,
  model text,
  status public.speech_transcript_status not null default 'uploaded',
  transcript text,
  confidence numeric(5,4) check (confidence is null or confidence between 0 and 1),
  language text not null default 'zh-CN',
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  consented_at timestamptz,
  expires_at timestamptz not null default (now() + interval '30 days'),
  error_code text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'completed') = (transcript is not null)),
  check (expires_at > created_at)
);

create index speech_transcripts_interview_user_idx on public.speech_transcripts(interview_id, user_id, created_at desc);
create index speech_transcripts_expiry_idx on public.speech_transcripts(status, expires_at);

create or replace function public.assign_speech_transcript_context()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  owner_id uuid;
  org_id uuid;
begin
  select p.user_id, i.organization_id into owner_id, org_id
  from public.interviews i
  join public.task_participants p on p.task_id = i.task_id and p.user_profile_id = i.user_profile_id
  where i.id = new.interview_id;
  if owner_id is null or owner_id is distinct from new.user_id then
    raise exception 'speech transcript owner must be the interview participant';
  end if;
  new.organization_id = org_id;
  return new;
end;
$$;

create trigger speech_transcripts_assign_context
before insert or update of interview_id, user_id on public.speech_transcripts
for each row execute function public.assign_speech_transcript_context();
create trigger speech_transcripts_set_audit_actor
before insert on public.speech_transcripts for each row execute function public.set_audit_actor();
create trigger speech_transcripts_set_updated_at
before update on public.speech_transcripts for each row execute function public.set_updated_at_and_actor();

alter table public.speech_transcripts enable row level security;

create policy speech_transcripts_owner_select on public.speech_transcripts
for select using (user_id = auth.uid());
create policy speech_transcripts_admin_select on public.speech_transcripts
for select using (public.is_org_admin(organization_id));
create policy speech_transcripts_owner_insert on public.speech_transcripts
for insert with check (user_id = auth.uid() and public.is_interview_participant(interview_id));
create policy speech_transcripts_owner_update on public.speech_transcripts
for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Objects use a user-id prefix: `<auth.uid()>/<transcript-id>.<extension>`.
-- There is intentionally no anonymous/public policy and no broad admin audio
-- download policy; access is issued server-side as a short-lived signed URL.
create policy interview_audio_owner_read on storage.objects for select using (
  bucket_id = 'interview-audio' and (storage.foldername(name))[1] = auth.uid()::text
);
create policy interview_audio_owner_insert on storage.objects for insert with check (
  bucket_id = 'interview-audio' and (storage.foldername(name))[1] = auth.uid()::text
);
create policy interview_audio_owner_delete on storage.objects for delete using (
  bucket_id = 'interview-audio' and (storage.foldername(name))[1] = auth.uid()::text
);

-- Retention is deliberately operational: a scheduled server-side job must mark
-- rows expired and remove the matching private object after `expires_at`.
-- No database trigger deletes recordings, avoiding accidental evidence loss.
