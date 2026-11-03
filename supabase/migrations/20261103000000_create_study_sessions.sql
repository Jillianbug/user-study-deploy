create table if not exists public.study_sessions (
  id text primary key check (id ~ '^[a-f0-9]{32}$'),
  username text not null check (char_length(btrim(username)) between 1 and 60),
  state jsonb not null,
  revision integer not null check (revision >= 1),
  completed boolean not null default false,
  updated_at timestamptz not null default now()
);

create index if not exists study_sessions_completed_updated_at_idx
  on public.study_sessions (completed, updated_at desc);

-- Browser clients have no direct table permissions. Only the Edge Function,
-- using the service-role key kept by Supabase, reads or writes these records.
alter table public.study_sessions enable row level security;
revoke all on table public.study_sessions from anon, authenticated;

-- Run this in the Supabase SQL Editor to export a CSV from the dashboard.
create or replace view public.study_results as
select
  s.id as participant_id,
  s.username,
  answer.key as sample,
  answer.value ->> 'instruction_following' as instruction_following,
  answer.value ->> 'multi_view_consistency' as multi_view_consistency,
  answer.value ->> 'visual_quality' as visual_quality,
  s.completed,
  s.updated_at
from public.study_sessions as s
cross join lateral jsonb_each(s.state -> 'answers') as answer;

revoke all on table public.study_results from anon, authenticated;
