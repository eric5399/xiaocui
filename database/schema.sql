-- PostgreSQL/psql entry point. The Supabase migration remains the single source
-- of truth, while this file provides a directly executable database/ path.
\set ON_ERROR_STOP on
\ir ../supabase/migrations/20260820000000_initial_schema.sql
\ir ../supabase/migrations/20260821000000_message_idempotency.sql
\ir ../supabase/migrations/20260822000000_security_baseline.sql
\ir ../supabase/migrations/20260823000000_llm_generation_audit.sql
