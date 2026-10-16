-- 2026-10-17: Verified secondary emails per customer (incremental; run in the Supabase SQL editor on existing databases).
-- A successful email OTP proves mailbox control; while signed in, the verified email is LINKED to the
-- current account instead of spawning a parallel user, so checkout emails and the account stay in sync.

begin;

create table if not exists public.customer_emails (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  email text not null unique,
  verified_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists customer_emails_user_id_idx
  on public.customer_emails (user_id);

-- Service-role only, same convention as the other shop tables.
alter table public.customer_emails enable row level security;
revoke all on public.customer_emails from anon, authenticated;

-- Backfill: every existing user owns their primary email.
insert into public.customer_emails (user_id, email)
select id, lower(btrim(email))
from public.users
on conflict (email) do nothing;

commit;
