-- The synced tables for a devotee's practice: sessions, count events and
-- namavali positions. Shapes mirror packages/shared/src/logic/rows.ts.
-- See docs/architecture/data-model.md#server-supabase.

create extension if not exists "uuid-ossp" with schema extensions;

-- Sessions: inserted once; `ended_at` may be filled in once, then never changes.
create table public.sessions (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  practice_id text not null check (practice_id <> ''),
  device_id text not null check (device_id <> ''),
  started_at timestamptz not null,
  ended_at timestamptz,
  local_day date not null,
  tz_offset_min integer not null,
  practice_version integer not null check (practice_version > 0),
  steps_per_repetition integer not null check (steps_per_repetition > 0),
  -- So a count event can only point at a session of the same devotee.
  unique (user_id, id)
);

-- Count events: sealed on the device, inserted once, never changed.
create table public.count_events (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  practice_id text not null check (practice_id <> ''),
  session_id uuid not null,
  mode text not null check (mode <> ''),
  count integer not null,
  estimated boolean not null,
  device_id text not null check (device_id <> ''),
  created_at timestamptz not null,
  local_day date not null,
  tz_offset_min integer not null,
  steps_per_repetition integer not null check (steps_per_repetition > 0),
  foreign key (user_id, session_id) references public.sessions (user_id, id)
);

create index count_events_user_session on public.count_events (user_id, session_id);

-- Positions: one per devotee and practice, merged by merge_practice_position.
-- `hlc` is the fixed-width text form (hlcText.ts); `collate "C"` makes `>`
-- compare bytes, as compareHlc does. Other collations skip punctuation.
create table public.practice_positions (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  practice_id text not null check (practice_id ~ '^[a-z0-9-]+$'),
  practice_version integer not null check (practice_version > 0),
  step_index integer not null check (step_index >= 0),
  chanted_steps text not null check (chanted_steps ~ '^([0-9a-f]{2})*$'),
  pass_ordinal integer not null check (pass_ordinal >= 0),
  hlc text collate "C" not null check (hlc ~ '^[0-9]{15}:[0-9]{10}:[a-z0-9-]+$'),
  deleted_hlc text collate "C" check (deleted_hlc ~ '^[0-9]{15}:[0-9]{10}:[a-z0-9-]+$'),
  deleted_at timestamptz,
  unique (user_id, practice_id)
);

-- Access. Explicit grants only: nothing for anon, and only what each table allows.
alter table public.sessions enable row level security;
alter table public.count_events enable row level security;
alter table public.practice_positions enable row level security;

revoke all on public.sessions, public.count_events, public.practice_positions from public, anon, authenticated;

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

-- Two bitsets of the same length, OR-ed byte by byte.
create function public.union_marks(a text, b text) returns text
language plpgsql immutable set search_path = '' as $$
declare
  x bytea := decode(a, 'hex');
  y bytea := decode(b, 'hex');
  i integer;
begin
  for i in 0 .. length(x) - 1 loop
    x := set_byte(x, i, get_byte(x, i) | get_byte(y, i));
  end loop;
  return encode(x, 'hex');
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
    -- Same length stands in for "fits the step count"; otherwise the later marks stand.
    if length(a.chanted_steps) = length(b.chanted_steps) then
      merged.chanted_steps := public.union_marks(behind.chanted_steps, ahead.chanted_steps);
    end if;
  end if;

  -- Deletion, settled on its own: the later deleted_hlc, with its deleted_at.
  if a.deleted_hlc is null and b.deleted_hlc is null then
    merged.deleted_hlc := null;
    merged.deleted_at := null;
  elsif b.deleted_hlc is null or (a.deleted_hlc is not null and a.deleted_hlc >= b.deleted_hlc) then
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
  hlc_pattern constant text := '^[0-9]{15}:[0-9]{10}:[a-z0-9-]+$';
  max_drift_ms constant bigint := 5 * 60 * 1000;
  now_ms constant bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  -- First: `null <> x` is null, not true, so a caller with no user is checked explicitly.
  if caller is null or "row" ->> 'user_id' is distinct from caller::text then
    raise exception 'Not your position' using errcode = '42501';
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
     or incoming.chanted_steps !~ '^([0-9a-f]{2})*$'
     or incoming.hlc !~ hlc_pattern
     or (incoming.deleted_hlc is not null and incoming.deleted_hlc !~ hlc_pattern)
     -- Canonical: a catalog id or a lowercase UUID, so one practice derives one id.
     or incoming.practice_id !~ '^[a-z0-9-]+$'
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

-- Supabase grants execute on new functions to everyone by default.
revoke all on function public.sessions_end_once() from public, anon, authenticated;
revoke all on function public.union_marks(text, text) from public, anon, authenticated;
revoke all on function public.merge_position_rows(public.practice_positions, public.practice_positions)
  from public, anon, authenticated;
revoke all on function public.merge_practice_position(jsonb) from public, anon, authenticated;
grant execute on function public.merge_practice_position(jsonb) to authenticated;

-- Replication. PowerSync reads with BYPASSRLS, so the sync config's queries,
-- not RLS, decide what each device downloads (powersync/sync-config.yaml).
-- Listing the tables keeps PowerSync from reading every other change.
create publication powersync for table public.sessions, public.count_events, public.practice_positions;

-- The role PowerSync Cloud connects as. No login here: a password is set on
-- the hosted database only, never in the repo. Locally it connects as postgres.
do $$
begin
  if not exists (select from pg_roles where rolname = 'powersync_role') then
    create role powersync_role with replication bypassrls nologin;
  end if;
end $$;

grant usage on schema public to powersync_role;
grant select on public.sessions, public.count_events, public.practice_positions to powersync_role;
