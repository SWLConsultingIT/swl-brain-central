-- 0018: Add notes column and 'responded' status
--
-- Notes: free-form text per job for human comments (sent at X, client viewed,
-- follow-up sent, etc). Persisted manually from the UI.
--
-- Responded: new terminal/intermediate status reachable from 'sent' when the
-- client replies on Upwork. From 'responded' the operator can rollback to
-- 'sent' (false positive) or discard.

alter table jobs
  add column if not exists notes text;

comment on column jobs.notes is
  'Free-form operator notes about the job (timeline, follow-ups, client comments). Manually edited from the UI.';

-- Extend the state machine
insert into jobs_allowed_transitions (from_status, to_status) values
  ('sent', 'responded'),
  ('responded', 'sent'),         -- rollback if marked by mistake
  ('responded', 'discarded')     -- archive responded that didn't convert
on conflict (from_status, to_status) do nothing;
