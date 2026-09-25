-- The synced tables for a devotee's practice: sessions, count events and
-- namavali positions. Shapes mirror packages/shared/src/logic/rows.ts.
-- See docs/architecture/data-model.md#server-supabase.

create extension if not exists "uuid-ossp" with schema extensions;

-- Closed by default. Supabase's defaults grant every new table and function in
-- `public` to anon, authenticated and service_role, so a migration that forgot
-- to revoke would expose it. From here on, each object is granted explicitly.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on functions from anon, authenticated, service_role;
-- Execute for PUBLIC is a global default, which a per-schema command can't revoke.
alter default privileges for role postgres revoke execute on functions from public;

-- Every text field has a length limit, so no row can be made expensive to
-- store or merge. Generous: practice ids are slugs or UUIDs, device ids UUIDs.

-- Sessions: inserted once; `ended_at` may be filled in once, then never changes.
create table public.sessions (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  practice_id text not null check (char_length(practice_id) between 1 and 128),
  device_id text not null check (char_length(device_id) between 1 and 64),
  started_at timestamptz not null,
  ended_at timestamptz,
  local_day date not null,
  tz_offset_min integer not null,
  practice_version integer not null check (practice_version > 0),
  steps_per_repetition integer not null check (steps_per_repetition > 0),
  -- So a count event can only point at a session of the same devotee, and
  -- copies the session's practice, day and step count (count_events' key).
  unique (user_id, id, practice_id, local_day, steps_per_repetition)
);

-- Count events: sealed on the device, inserted once, never changed.
create table public.count_events (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  practice_id text not null check (char_length(practice_id) between 1 and 128),
  session_id uuid not null,
  -- ChantMode, packages/shared/src/types/practice.ts.
  mode text not null check (mode in ('mala_tap', 'word_tap', 'likhita_typing', 'silent_pace',
                                     'silent_breath', 'volume_button', 'manual', 'correction', 'voice',
                                     'watch', 'chant_along', 'listening', 'handwriting', 'ring')),
  -- Completed repetitions: positive, except a correction, which may be negative but never 0.
  count integer not null check (case when mode = 'correction' then count <> 0 else count > 0 end),
  estimated boolean not null,
  device_id text not null check (char_length(device_id) between 1 and 64),
  created_at timestamptz not null,
  local_day date not null,
  tz_offset_min integer not null,
  steps_per_repetition integer not null check (steps_per_repetition > 0),
  -- Every event in a session shares its practice, local_day and step count
  -- (docs/architecture/data-model.md#session), so the key carries all three.
  foreign key (user_id, session_id, practice_id, local_day, steps_per_repetition)
    references public.sessions (user_id, id, practice_id, local_day, steps_per_repetition)
);

create index count_events_user_session on public.count_events (user_id, session_id);

-- Positions: one per devotee and practice, merged by merge_practice_position.
-- `hlc` is the fixed-width text form (hlcText.ts); `collate "C"` makes `>`
-- compare bytes, as compareHlc does. Other collations skip punctuation.
create table public.practice_positions (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  practice_id text not null check (practice_id ~ '^[a-z0-9-]{1,128}$'),
  practice_version integer not null check (practice_version > 0),
  step_index integer not null check (step_index >= 0),
  -- At most 512 bytes: 4,096 names, well past a Sahasranama's 1,000.
  chanted_steps text not null
    check (char_length(chanted_steps) <= 1024 and chanted_steps ~ '^([0-9a-f]{2})*$'),
  pass_ordinal integer not null check (pass_ordinal >= 0),
  hlc text collate "C" not null check (hlc ~ '^[0-9]{15}:[0-9]{10}:[a-z0-9-]{1,64}$'),
  deleted_hlc text collate "C" check (deleted_hlc ~ '^[0-9]{15}:[0-9]{10}:[a-z0-9-]{1,64}$'),
  deleted_at timestamptz,
  -- A deletion is its clock and its time together; the merge carries them as a pair.
  check ((deleted_hlc is null) = (deleted_at is null)),
  unique (user_id, practice_id)
);

-- Access. Explicit grants only: nothing for anon or service_role, and only what each table allows.
alter table public.sessions enable row level security;
alter table public.count_events enable row level security;
alter table public.practice_positions enable row level security;

revoke all on public.sessions, public.count_events, public.practice_positions
  from public, anon, authenticated, service_role;

grant select, insert on public.sessions to authenticated;
grant update (ended_at) on public.sessions to authenticated;
grant select, insert on public.count_events to authenticated;
grant select on public.practice_positions to authenticated;

create policy "read own sessions" on public.sessions
  for select to authenticated using (user_id = (select auth.uid()));
create policy "insert own sessions" on public.sessions
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "end own sessions" on public.sessions
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "read own count events" on public.count_events
  for select to authenticated using (user_id = (select auth.uid()));
create policy "insert own count events" on public.count_events
  for insert to authenticated with check (user_id = (select auth.uid()));

create policy "read own positions" on public.practice_positions
  for select to authenticated using (user_id = (select auth.uid()));

-- `ended_at` is set once. Class 23, so the connector sets a violation aside
-- instead of retrying it forever.
create function public.sessions_end_once() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.ended_at is not null and new.ended_at is distinct from old.ended_at then
    raise exception 'A session''s ended_at is set once' using errcode = '23514';
  end if;
  return new;
end $$;

create trigger sessions_end_once before update on public.sessions
  for each row execute function public.sessions_end_once();

-- Two bitsets OR-ed byte by byte, the shorter padded with zeros: a union of
-- sets of names, so it is associative whatever the lengths.
create function public.union_marks(a text, b text) returns text
language plpgsql immutable set search_path = '' as $$
declare
  longer bytea := decode(a, 'hex');
  shorter bytea := decode(b, 'hex');
  swap bytea;
  i integer;
begin
  if length(longer) < length(shorter) then
    swap := longer;
    longer := shorter;
    shorter := swap;
  end if;
  for i in 0 .. length(shorter) - 1 loop
    longer := set_byte(longer, i, get_byte(longer, i) | get_byte(shorter, i));
  end loop;
  return encode(longer, 'hex');
end $$;

-- mergePositions (packages/shared/src/logic/position.ts) without the
-- step-count checks: the server has no catalog. Every part is a maximum or a
-- union, so replicas converge whatever order and grouping rows arrive in.
create function public.merge_position_rows(a public.practice_positions, b public.practice_positions)
returns public.practice_positions
language plpgsql immutable set search_path = '' as $$
declare
  ahead public.practice_positions;
  behind public.practice_positions;
  merged public.practice_positions;
begin
  if a.user_id <> b.user_id then
    raise exception 'Cannot merge positions belonging to different devotees';
  end if;
  if a.practice_id <> b.practice_id then
    raise exception 'Cannot merge positions for different practices';
  end if;

  -- The live half. The higher generation (version, then pass) wins outright.
  if (a.practice_version, a.pass_ordinal) <> (b.practice_version, b.pass_ordinal) then
    merged := case
      when (a.practice_version, a.pass_ordinal) > (b.practice_version, b.pass_ordinal) then a
      else b
    end;
  else
    -- Within one generation: step_index from the higher hlc; ties by id, then step_index.
    if (a.hlc, a.id, a.step_index) >= (b.hlc, b.id, b.step_index) then
      ahead := a;
      behind := b;
    else
      ahead := b;
      behind := a;
    end if;
    merged := ahead;
    -- One generation means one step count, so honest rows have the same length.
    -- The server can't check the step count, so a corrupt length is still
    -- unioned: choosing between lengths pairwise would depend on arrival order.
    merged.chanted_steps := public.union_marks(behind.chanted_steps, ahead.chanted_steps);
  end if;

  -- Deletion, settled on its own: the later deleted_hlc, with its deleted_at.
  -- A tie on the clock goes to the later deleted_at, so a corrupt pair can't
  -- make the result depend on argument order.
  if a.deleted_hlc is null and b.deleted_hlc is null then
    merged.deleted_hlc := null;
    merged.deleted_at := null;
  elsif b.deleted_hlc is null
        or (a.deleted_hlc is not null and (a.deleted_hlc, a.deleted_at) >= (b.deleted_hlc, b.deleted_at)) then
    merged.deleted_hlc := a.deleted_hlc;
    merged.deleted_at := a.deleted_at;
  else
    merged.deleted_hlc := b.deleted_hlc;
    merged.deleted_at := b.deleted_at;
  end if;

  return merged;
end $$;

-- The upload path for positions: the device sends its whole row as JSON.
-- security definer, because devotees have no write grant on the table, so it
-- guards itself: the caller must be the row's owner, and anything malformed is
-- dropped with success so one bad row can't block the upload queue.
create function public.merge_practice_position("row" jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  incoming public.practice_positions;
  stored public.practice_positions;
  merged public.practice_positions;
  hlc_pattern constant text := '^[0-9]{15}:[0-9]{10}:[a-z0-9-]{1,64}$';
  -- A real row is a few hundred bytes; checked before any other work, on the
  -- text, because pg_column_size would count a compressed value's stored size.
  max_row_bytes constant integer := 4096;
  max_drift_ms constant bigint := 5 * 60 * 1000;
  now_ms constant bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  -- First: `null <> x` is null, not true, so a caller with no user is checked explicitly.
  if caller is null or "row" ->> 'user_id' is distinct from caller::text then
    raise exception 'Not your position' using errcode = '42501';
  end if;

  if octet_length("row"::text) > max_row_bytes then
    return;
  end if;

  if not ("row" ?& array['id', 'user_id', 'practice_id', 'practice_version', 'step_index',
                         'chanted_steps', 'pass_ordinal', 'hlc', 'deleted_hlc', 'deleted_at'])
     or jsonb_typeof("row" -> 'id') <> 'string'
     or jsonb_typeof("row" -> 'practice_id') <> 'string'
     or jsonb_typeof("row" -> 'practice_version') <> 'number'
     or jsonb_typeof("row" -> 'step_index') <> 'number'
     or jsonb_typeof("row" -> 'chanted_steps') <> 'string'
     or jsonb_typeof("row" -> 'pass_ordinal') <> 'number'
     or jsonb_typeof("row" -> 'hlc') <> 'string'
     or jsonb_typeof("row" -> 'deleted_hlc') not in ('string', 'null')
     or jsonb_typeof("row" -> 'deleted_at') not in ('string', 'null') then
    return;
  end if;

  begin
    incoming := jsonb_populate_record(null::public.practice_positions, "row");
  exception when data_exception then
    return; -- a fractional or huge number, a bad uuid or time
  end;

  if incoming.practice_version <= 0
     or incoming.step_index < 0
     or incoming.pass_ordinal < 0
     or char_length(incoming.chanted_steps) > 1024
     or incoming.chanted_steps !~ '^([0-9a-f]{2})*$'
     or incoming.hlc !~ hlc_pattern
     or (incoming.deleted_hlc is not null and incoming.deleted_hlc !~ hlc_pattern)
     or (incoming.deleted_hlc is null) <> (incoming.deleted_at is null)
     -- Canonical: a catalog id or a lowercase UUID, so one practice derives one id.
     or incoming.practice_id !~ '^[a-z0-9-]{1,128}$'
     or incoming.id <> extensions.uuid_generate_v5(
          '49841fbe-b559-4c62-ae52-0d0611052939'::uuid,
          'v1:practice_positions:' || incoming.user_id::text || ':' || incoming.practice_id)
     or left(incoming.hlc, 15)::bigint > now_ms + max_drift_ms
     or left(coalesce(incoming.deleted_hlc, '0'), 15)::bigint > now_ms + max_drift_ms then
    return;
  end if;

  insert into public.practice_positions select (incoming).* on conflict (id) do nothing;
  select * into stored from public.practice_positions where id = incoming.id for update;
  merged := public.merge_position_rows(stored, incoming);

  update public.practice_positions set
    practice_version = merged.practice_version,
    step_index = merged.step_index,
    chanted_steps = merged.chanted_steps,
    pass_ordinal = merged.pass_ordinal,
    hlc = merged.hlc,
    deleted_hlc = merged.deleted_hlc,
    deleted_at = merged.deleted_at
  where id = incoming.id;
end $$;

-- The server's time, so a device can correct its clock offset before its
-- positions upload, instead of having them dropped for running ahead.
create function public.server_now() returns timestamptz
language sql stable set search_path = '' as $$ select now() $$;

-- Supabase grants execute on new functions to everyone by default.
revoke all on function public.sessions_end_once() from public, anon, authenticated, service_role;
revoke all on function public.union_marks(text, text) from public, anon, authenticated, service_role;
revoke all on function public.merge_position_rows(public.practice_positions, public.practice_positions)
  from public, anon, authenticated, service_role;
revoke all on function public.merge_practice_position(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.merge_practice_position(jsonb) to authenticated;
revoke all on function public.server_now() from public, anon, authenticated, service_role;
grant execute on function public.server_now() to authenticated;

-- Replication. PowerSync reads with BYPASSRLS, so the sync config's queries,
-- not RLS, decide what each device downloads (powersync/sync-config.yaml).
-- Listing the tables keeps PowerSync from reading every other change.
create publication powersync for table public.sessions, public.count_events, public.practice_positions;

-- The role PowerSync Cloud connects as. NOLOGIN here, because a password never
-- goes in the repo: after this migration is pushed, the owner runs
-- `alter role powersync_role with login password '…'` on the hosted database
-- (docs/plans/active/2026-09-24-s4-sync-prototype.md, PR 5). Locally PowerSync
-- connects as postgres.
do $$
begin
  if not exists (select from pg_roles where rolname = 'powersync_role') then
    create role powersync_role with replication bypassrls nologin;
  end if;
end $$;

grant usage on schema public to powersync_role;
grant select on public.sessions, public.count_events, public.practice_positions to powersync_role;
