-- Row-level security, grants and constraints on the synced tables.
-- See docs/architecture/data-model.md#server-supabase.
begin;
create extension if not exists pgtap with schema extensions;

select plan(38);

-- Two devotees.
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-00000000000a', 'a@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000000b', 'b@example.test', 'authenticated', 'authenticated');

create function pg_temp.act_as(user_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;

-- A count event in A's session, with one field changed. Runs as the caller.
create function pg_temp.insert_event(
  p_id uuid,
  p_mode text default 'mala_tap',
  p_count int default 108,
  p_practice text default 'om-namah-shivaya',
  p_day date default '2026-09-24',
  p_steps int default 1
) returns void language sql as $$
  insert into public.count_events (id, user_id, practice_id, session_id, mode, count, estimated, device_id,
                                   created_at, local_day, tz_offset_min, steps_per_repetition)
  values (p_id, '00000000-0000-4000-8000-00000000000a', p_practice, '00000000-0000-7000-8000-0000000000a1',
          p_mode, p_count, false, 'device-a', '2026-09-24T05:50:00Z', p_day, 330, p_steps)
$$;

-- New functions are closed by default (the migration's default privileges), so
-- grant these test helpers explicitly, as a migration would.
do $$
declare f regprocedure;
begin
  for f in select oid::regprocedure from pg_proc where pronamespace = pg_my_temp_schema() loop
    execute format('grant execute on function %s to public', f);
  end loop;
end $$;

-- A's session and event, written as A.
select pg_temp.act_as('00000000-0000-4000-8000-00000000000a');

select lives_ok($$
  insert into public.sessions (id, user_id, practice_id, device_id, started_at, ended_at, local_day,
                               tz_offset_min, practice_version, steps_per_repetition)
  values ('00000000-0000-7000-8000-0000000000a1', '00000000-0000-4000-8000-00000000000a',
          'om-namah-shivaya', 'device-a', '2026-09-24T05:30:00Z', null, '2026-09-24', 330, 1, 1)
$$, 'a devotee inserts their own session');

select lives_ok($$
  insert into public.count_events (id, user_id, practice_id, session_id, mode, count, estimated, device_id,
                                   created_at, local_day, tz_offset_min, steps_per_repetition)
  values ('00000000-0000-7000-8000-0000000000a2', '00000000-0000-4000-8000-00000000000a',
          'om-namah-shivaya', '00000000-0000-7000-8000-0000000000a1', 'mala_tap', 108, false, 'device-a',
          '2026-09-24T05:42:00Z', '2026-09-24', 330, 1)
$$, 'a devotee inserts their own count event');

select lives_ok($$
  insert into public.count_events (id, user_id, practice_id, session_id, mode, count, estimated, device_id,
                                   created_at, local_day, tz_offset_min, steps_per_repetition)
  values ('00000000-0000-7000-8000-0000000000a2', '00000000-0000-4000-8000-00000000000a',
          'om-namah-shivaya', '00000000-0000-7000-8000-0000000000a1', 'mala_tap', 108, false, 'device-a',
          '2026-09-24T05:42:00Z', '2026-09-24', 330, 1)
  on conflict (id) do nothing
$$, 'uploading an event the server already has is ignored, not an error');

select is((select count(*) from public.count_events), 1::bigint, 'so it is stored once');

-- A count means something: a known mode, and completed repetitions.
select throws_ok($$ select pg_temp.insert_event('00000000-0000-7000-8000-0000000000c1', p_count => -100) $$,
  '23514', null, 'a chanted count must be positive: -100 is refused');
select throws_ok($$ select pg_temp.insert_event('00000000-0000-7000-8000-0000000000c2', p_count => 0) $$,
  '23514', null, 'and so is 0');
select throws_ok($$ select pg_temp.insert_event('00000000-0000-7000-8000-0000000000c3', p_mode => 'made_up', p_count => 1) $$,
  '23514', null, 'a mode that is not a chant mode is refused');
select lives_ok($$ select pg_temp.insert_event('00000000-0000-7000-8000-0000000000c4', p_mode => 'correction', p_count => -5) $$,
  'a correction may be negative');
select throws_ok($$ select pg_temp.insert_event('00000000-0000-7000-8000-0000000000c5', p_mode => 'correction', p_count => 0) $$,
  '23514', null, 'but not 0');

-- An event copies its session's practice, day and step count.
select throws_ok($$ select pg_temp.insert_event('00000000-0000-7000-8000-0000000000c6', p_practice => 'gayatri') $$,
  '23503', null, 'a count event cannot name a different practice from its session');
select throws_ok($$ select pg_temp.insert_event('00000000-0000-7000-8000-0000000000c7', p_day => '2026-09-25') $$,
  '23503', null, 'nor a different local_day');
select throws_ok($$ select pg_temp.insert_event('00000000-0000-7000-8000-0000000000c8', p_steps => 108) $$,
  '23503', null, 'nor a different steps_per_repetition');

select throws_ok($$
  insert into public.sessions (id, user_id, practice_id, device_id, started_at, local_day,
                               tz_offset_min, practice_version, steps_per_repetition)
  values ('00000000-0000-7000-8000-0000000000a3', '00000000-0000-4000-8000-00000000000b',
          'om-namah-shivaya', 'device-a', '2026-09-24T05:30:00Z', '2026-09-24', 330, 1, 1)
$$, '42501', null, 'a devotee cannot insert a session for someone else');

select throws_ok($$ update public.count_events set count = 1 $$, '42501', null,
  'count events cannot be updated, even by their owner');
select throws_ok($$ delete from public.count_events $$, '42501', null,
  'count events cannot be deleted, even by their owner');
select throws_ok($$ delete from public.sessions $$, '42501', null,
  'sessions cannot be deleted');

select throws_ok($$ update public.sessions set practice_id = 'gayatri' $$, '42501', null,
  'no session column but ended_at can change');
select lives_ok($$ update public.sessions set ended_at = '2026-09-24T06:00:00Z' where ended_at is null $$,
  'ended_at can be filled in');
select throws_ok($$ update public.sessions set ended_at = '2026-09-24T07:00:00Z' $$, '23514', null,
  'once filled in, ended_at never changes');
select is((select ended_at from public.sessions), '2026-09-24T06:00:00Z'::timestamptz, 'it keeps the first value');

-- B.
select pg_temp.act_as('00000000-0000-4000-8000-00000000000b');

select is((select count(*) from public.sessions), 0::bigint, 'a devotee sees no one else''s sessions');
select is((select count(*) from public.count_events), 0::bigint, 'nor their count events');

select lives_ok($$
  insert into public.sessions (id, user_id, practice_id, device_id, started_at, local_day,
                               tz_offset_min, practice_version, steps_per_repetition)
  values ('00000000-0000-7000-8000-0000000000b1', '00000000-0000-4000-8000-00000000000b',
          'om-namah-shivaya', 'device-b', '2026-09-24T05:30:00Z', '2026-09-24', 330, 1, 1)
$$, 'B inserts their own session');

select throws_ok($$
  insert into public.count_events (id, user_id, practice_id, session_id, mode, count, estimated, device_id,
                                   created_at, local_day, tz_offset_min, steps_per_repetition)
  values ('00000000-0000-7000-8000-0000000000b2', '00000000-0000-4000-8000-00000000000b',
          'om-namah-shivaya', '00000000-0000-7000-8000-0000000000a1', 'mala_tap', 108, false, 'device-b',
          '2026-09-24T05:42:00Z', '2026-09-24', 330, 1)
$$, '23503', null, 'a count event cannot point at another devotee''s session');

select throws_ok($$
  insert into public.practice_positions (id, user_id, practice_id, practice_version, step_index,
                                         chanted_steps, pass_ordinal, hlc)
  values ('7f64746d-3241-5ed7-a7b0-cfa9400cad6f', '00000000-0000-4000-8000-00000000000b',
          'vishnu-ashtottara', 1, 0, '00', 0, '001727190000000:0000000000:device-b')
$$, '42501', null, 'positions cannot be written directly, only through the merge function');

select throws_ok($$
  insert into public.sessions (id, user_id, practice_id, device_id, started_at, local_day,
                               tz_offset_min, practice_version, steps_per_repetition)
  values ('00000000-0000-7000-8000-0000000000b3', '00000000-0000-4000-8000-00000000000b',
          repeat('p', 129), 'device-b', '2026-09-24T05:30:00Z', '2026-09-24', 330, 1, 1)
$$, '23514', null, 'text fields have a length limit: a practice_id of 129 characters is refused');

-- Anyone not signed in.
select set_config('role', 'anon', true);
select throws_ok($$ select count(*) from public.sessions $$, '42501', null, 'anon cannot read sessions');
select throws_ok($$ select count(*) from public.count_events $$, '42501', null, 'anon cannot read count events');
select throws_ok($$ select count(*) from public.practice_positions $$, '42501', null, 'anon cannot read positions');

-- As the owner of the database.
select set_config('role', 'postgres', true);

create table public.added_later (id int);
select ok(not has_table_privilege('authenticated', 'public.added_later', 'select')
          and not has_table_privilege('anon', 'public.added_later', 'select'),
          'a table added to public later is not exposed until a migration grants it');
create function public.added_later_fn() returns int language sql as $$ select 1 $$;
select ok(not has_function_privilege('authenticated', 'public.added_later_fn()', 'execute')
          and not has_function_privilege('anon', 'public.added_later_fn()', 'execute'),
          'nor is a function');
select ok(not has_table_privilege('service_role', 'public.added_later', 'select')
          and not has_function_privilege('service_role', 'public.added_later_fn()', 'execute'),
          'nor does the service role get either');
select is_empty(
  $$ select table_name from information_schema.role_table_grants
     where grantee = 'service_role' and table_schema = 'public'
       and table_name in ('sessions', 'count_events', 'practice_positions')
     union all
     select routine_name from information_schema.role_routine_grants
     where grantee = 'service_role' and routine_schema = 'public'
       and routine_name in ('sessions_end_once', 'union_marks', 'merge_position_rows',
                            'merge_practice_position', 'server_now') $$,
  'the service role has no grant on the synced tables or their functions'
);

select throws_ok($$
  insert into public.practice_positions (id, user_id, practice_id, practice_version, step_index,
                                         chanted_steps, pass_ordinal, hlc, deleted_hlc, deleted_at)
  values ('7f64746d-3241-5ed7-a7b0-cfa9400cad6f', '00000000-0000-4000-8000-00000000000a',
          'vishnu-ashtottara', 1, 0, '00', 0, '001727190000000:0000000000:device-a',
          '001727190000001:0000000000:device-a', null)
$$, '23514', null, 'a position''s deleted_hlc and deleted_at are set together or not at all');

select set_eq(
  $$ select schemaname || '.' || tablename from pg_publication_tables where pubname = 'powersync' $$,
  array['public.sessions', 'public.count_events', 'public.practice_positions'],
  'the powersync publication lists exactly the three synced tables'
);

-- The role PowerSync Cloud connects as.
select ok((select rolreplication and rolbypassrls and not rolcanlogin from pg_roles
           where rolname = 'powersync_role'),
          'powersync_role can replicate and bypass RLS, and cannot log in until the hosted database gives it a password');
select set_eq(
  $$ select table_schema || '.' || table_name || ':' || privilege_type
     from information_schema.role_table_grants where grantee = 'powersync_role' $$,
  array['public.sessions:SELECT', 'public.count_events:SELECT', 'public.practice_positions:SELECT'],
  'powersync_role may select the three synced tables, and nothing else'
);

delete from auth.users where id = '00000000-0000-4000-8000-00000000000a';
select is(
  (select count(*) from public.sessions where user_id = '00000000-0000-4000-8000-00000000000a')
  + (select count(*) from public.count_events where user_id = '00000000-0000-4000-8000-00000000000a'),
  0::bigint,
  'deleting a devotee deletes everything they own'
);

select * from finish();
rollback;
