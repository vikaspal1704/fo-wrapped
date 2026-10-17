-- F&O Journal: entitlements, webhook idempotency, end-to-end encrypted sync
-- records and reminder preferences (docs/adr/0002, 0004; docs/SPEC.md §4).
-- The server never holds trade data in clear: journal_records are AES-GCM
-- ciphertext with opaque HMAC record IDs.

create table public.entitlements (
  user_id uuid primary key references auth.users (id) on delete cascade,
  status text not null check (status in ('active', 'pending', 'halted', 'cancelled', 'completed', 'expired', 'paused')),
  plan text check (plan in ('monthly', 'annual')),
  current_period_end timestamptz,
  razorpay_subscription_id text unique,
  -- Newest webhook applied; older events are ignored (ADR-0004).
  last_event_at timestamptz not null default 'epoch',
  updated_at timestamptz not null default now()
);

-- One row per Razorpay event ID: a second delivery is a no-op.
create table public.webhook_events (
  event_id text primary key,
  event_type text not null,
  received_at timestamptz not null default now()
);

create table public.journal_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  kdf_salt text not null,
  kdf_iterations integer not null check (kdf_iterations >= 100000),
  key_check_iv text not null,
  key_check text not null,
  created_at timestamptz not null default now()
);

create table public.journal_records (
  user_id uuid not null references auth.users (id) on delete cascade,
  collection text not null check (collection in ('imports', 'notes', 'rules')),
  record_id text not null check (record_id ~ '^[0-9a-f]{64}$'),
  iv text not null,
  ciphertext text not null,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, collection, record_id)
);
create index journal_records_changes on public.journal_records (user_id, updated_at);

create table public.reminder_prefs (
  user_id uuid primary key references auth.users (id) on delete cascade,
  weekly boolean not null default false,
  unsubscribe_token text not null unique default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  updated_at timestamptz not null default now()
);

-- Used by the policies below. security definer so it can read entitlements
-- whatever the caller's own grants are; it only ever answers yes or no.
create function public.has_active_plan(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.entitlements e
    where e.user_id = uid and e.status = 'active' and e.current_period_end > now()
  );
$$;

alter table public.entitlements enable row level security;
alter table public.webhook_events enable row level security;
alter table public.journal_profiles enable row level security;
alter table public.journal_records enable row level security;
alter table public.reminder_prefs enable row level security;

-- Entitlements: a user reads only their own; only the service role writes.
create policy entitlements_read_own on public.entitlements
  for select to authenticated using (user_id = auth.uid());

-- webhook_events: no policies at all, so only the service role can touch it.

create policy profiles_own_with_plan on public.journal_profiles
  for all to authenticated
  using (user_id = auth.uid() and public.has_active_plan(auth.uid()))
  with check (user_id = auth.uid() and public.has_active_plan(auth.uid()));

create policy records_own_with_plan on public.journal_records
  for all to authenticated
  using (user_id = auth.uid() and public.has_active_plan(auth.uid()))
  with check (user_id = auth.uid() and public.has_active_plan(auth.uid()));

-- Anyone signed in may turn reminders off; turning them on needs a plan.
create policy reminders_own on public.reminder_prefs
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and (weekly = false or public.has_active_plan(auth.uid())));

grant select on public.entitlements to authenticated;
grant select, insert, update, delete on public.journal_profiles, public.journal_records, public.reminder_prefs to authenticated;
revoke all on public.webhook_events from anon, authenticated;

-- Recipients for the weekly reminder: opted in and with an active plan.
-- Service role only (the reminder Edge Function).
create function public.weekly_recipients() returns table (email text, token text)
language sql stable security definer set search_path = public, auth as $$
  select u.email, p.unsubscribe_token
  from public.reminder_prefs p join auth.users u on u.id = p.user_id
  where p.weekly and public.has_active_plan(p.user_id) and u.email is not null;
$$;
revoke execute on function public.weekly_recipients() from public, anon, authenticated;
