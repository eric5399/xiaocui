-- Durable idempotency for browser retries. The existing metadata copy remains
-- for audit readability, while this indexed column makes the constraint safe
-- across server instances.
alter table public.messages
  add column if not exists client_message_id varchar(120);

create unique index if not exists messages_interview_client_message_id_key
  on public.messages (interview_id, client_message_id)
  where client_message_id is not null;
