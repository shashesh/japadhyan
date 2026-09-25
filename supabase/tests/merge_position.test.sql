-- The server's position merge. Each case below mirrors the case of the same
-- name in packages/shared/src/logic/position.test.ts, except the ones that
-- need the step count, which the server has no catalog to know:
--   refuses a live winner whose step_index is not a real name
--   refuses a live winner with a negative step_index
--   accepts the last real name as a step_index
--   does not police the step_index of a tombstone
--   refuses to return a malformed position through the early-exit paths
--   does not mutate either side (SQL values can't be mutated)
-- See docs/architecture/data-model.md#practiceposition.
begin;
create extension if not exists pgtap with schema extensions;

select plan(78);

-- 108 names: 14 bytes, bit i of byte i / 8, lowest bit first (as in marks.ts).
create function pg_temp.marks(idx int[] default '{}', steps int default 108) returns text
language plpgsql as $$
declare
  b bytea := decode(repeat('00', (steps + 7) / 8), 'hex');
  i int;
begin
  foreach i in array idx loop
    b := set_byte(b, i / 8, get_byte(b, i / 8) | (1 << (i % 8)));
  end loop;
  return encode(b, 'hex');
end $$;

create function pg_temp.h(millis bigint, device text default 'a') returns text
language sql as $$ select lpad(millis::text, 15, '0') || ':0000000000:' || device $$;

create function pg_temp.pos(
  p_marks int[] default '{}',
  p_version int default 1,
  p_pass int default 1,
  p_step int default 0,
  p_hlc bigint default 1000,
  p_device text default 'a',
  p_deleted bigint default null,
  p_id uuid default '7f64746d-3241-5ed7-a7b0-cfa9400cad6f',
  p_marks_hex text default null,
  p_user uuid default '0192a4b0-8c3e-7d4a-9b1f-2e3d4c5b6a79',
  p_practice text default 'vishnu-ashtottara',
  p_deleted_at timestamptz default '2026-09-22T12:00:00Z'
) returns public.practice_positions
language sql as $$
  select p_id, p_user, p_practice, p_version, p_step, coalesce(p_marks_hex, pg_temp.marks(p_marks)),
         p_pass, pg_temp.h(p_hlc, p_device),
         case when p_deleted is null then null else pg_temp.h(p_deleted, p_device) end,
         case when p_deleted is null then null else p_deleted_at end
$$;

create function pg_temp.merge(a public.practice_positions, b public.practice_positions)
returns public.practice_positions language sql as $$ select public.merge_position_rows(a, b) $$;

create function pg_temp.is_deleted(p public.practice_positions) returns boolean
language sql as $$ select p.deleted_hlc is not null and p.deleted_hlc > p.hlc $$;

-- The fields that must agree for two replicas to have converged.
create function pg_temp.shape(p public.practice_positions) returns text
language sql as $$
  select concat_ws('|', p.practice_version, p.pass_ordinal, p.step_index, p.chanted_steps, p.hlc,
                   p.deleted_hlc, p.deleted_at)
$$;

-- practice_version
select is((pg_temp.merge(pg_temp.pos('{0,1,2}', p_version => 1, p_hlc => 9000),
                         pg_temp.pos('{}', p_version => 2, p_hlc => 1000))).chanted_steps,
          pg_temp.marks('{}'), 'a newer version wins, so a content reset holds');
select is((pg_temp.merge(pg_temp.pos('{0,1,2}', p_version => 1, p_hlc => 999999),
                         pg_temp.pos('{5}', p_version => 2, p_hlc => 1))).practice_version,
          2, 'an old version never wins however late it syncs');
select is((pg_temp.merge(pg_temp.pos('{5}', p_version => 2, p_hlc => 1),
                         pg_temp.pos('{0,1,2}', p_version => 1, p_hlc => 999999))).practice_version,
          2, 'an old version never wins however late it syncs (other way round)');

-- pass_ordinal
select is((pg_temp.merge(pg_temp.pos('{0,1,2}', p_pass => 4, p_hlc => 9000),
                         pg_temp.pos('{7}', p_pass => 5, p_hlc => 1000))).chanted_steps,
          pg_temp.marks('{7}'), 'a higher pass wins, so a finished recitation cannot come back');
select is((pg_temp.merge(pg_temp.pos(p_version => 1, p_pass => 99),
                         pg_temp.pos(p_version => 2, p_pass => 1))).pass_ordinal,
          1, 'pass_ordinal is only compared within the same version');

-- same version and pass
select is((pg_temp.merge(pg_temp.pos('{0,1}', p_hlc => 1000, p_device => 'phone'),
                         pg_temp.pos('{1,2}', p_hlc => 2000, p_device => 'tablet'))).chanted_steps,
          pg_temp.marks('{0,1,2}'), 'combines the marks, so a name chanted on either device stays chanted');
select is((pg_temp.merge(pg_temp.pos('{0}', p_step => 90, p_hlc => 1000),
                         pg_temp.pos('{0}', p_step => 3, p_hlc => 2000))).step_index,
          3, 'takes step_index from the higher hlc, not the higher index');
select is((pg_temp.merge(pg_temp.pos('{0}', p_hlc => 1000), pg_temp.pos('{1}', p_hlc => 2000))).hlc,
          pg_temp.h(2000), 'keeps the higher hlc so the merge propagates');
select is((pg_temp.merge(pg_temp.pos('{50,51,52}', p_hlc => 1000),
                         pg_temp.pos('{0}', p_hlc => 2000))).chanted_steps,
          pg_temp.marks('{0,50,51,52}'), 'never loses a mark the loser of the hlc comparison had');

-- deletions
select ok(pg_temp.is_deleted(pg_temp.merge(pg_temp.pos(p_deleted => 9000, p_hlc => 0),
                                           pg_temp.pos('{0}', p_pass => 99, p_hlc => 1000))),
          'a deletion is not resurrected by a higher pass from an earlier edit');
select ok(pg_temp.is_deleted(pg_temp.merge(pg_temp.pos(p_version => 1, p_deleted => 9000, p_hlc => 0),
                                           pg_temp.pos('{0}', p_version => 2, p_hlc => 1000))),
          'a deletion is not resurrected by a newer practice version from an earlier edit');
select ok(not pg_temp.is_deleted(pg_temp.merge(pg_temp.pos(p_deleted => 1000, p_hlc => 0),
                                               pg_temp.pos('{0}', p_hlc => 9000))),
          'chanting again after a deletion brings the position back');
select is(pg_temp.is_deleted(pg_temp.merge(pg_temp.pos(p_deleted => 9000, p_hlc => 0),
                                           pg_temp.pos('{0}', p_pass => 99, p_hlc => 1000))),
          pg_temp.is_deleted(pg_temp.merge(pg_temp.pos('{0}', p_pass => 99, p_hlc => 1000),
                                           pg_temp.pos(p_deleted => 9000, p_hlc => 0))),
          'settles the same way whichever device merges');
select is((pg_temp.merge(pg_temp.pos(p_deleted => 9000, p_hlc => 0),
                         pg_temp.pos(p_deleted => 9000, p_hlc => 0, p_deleted_at => '2026-09-22T12:05:00Z'))).deleted_at,
          '2026-09-22T12:05:00Z'::timestamptz,
          'a tie on deleted_hlc settles on the later deleted_at, whichever device merges');
select is((pg_temp.merge(pg_temp.pos(p_deleted => 9000, p_hlc => 0, p_deleted_at => '2026-09-22T12:05:00Z'),
                         pg_temp.pos(p_deleted => 9000, p_hlc => 0))).deleted_at,
          '2026-09-22T12:05:00Z'::timestamptz,
          'and the same the other way round');
select ok(pg_temp.is_deleted(pg_temp.merge(pg_temp.pos(p_marks_hex => '00', p_deleted => 9000, p_hlc => 0),
                                           pg_temp.pos('{0}', p_hlc => 1000))),
          'a tombstone is accepted even when its bitset is a stale size');

-- associativity
select is(pg_temp.shape(pg_temp.merge(pg_temp.merge(pg_temp.pos('{0}', p_hlc => 1),
                                                    pg_temp.pos(p_deleted => 2, p_hlc => 0)),
                                      pg_temp.pos('{1}', p_hlc => 3))),
          pg_temp.shape(pg_temp.merge(pg_temp.pos('{0}', p_hlc => 1),
                                      pg_temp.merge(pg_temp.pos(p_deleted => 2, p_hlc => 0),
                                                    pg_temp.pos('{1}', p_hlc => 3)))),
          'a tombstone between two live edits does not depend on grouping');
select is(pg_temp.shape(pg_temp.merge(pg_temp.merge(pg_temp.pos('{0}', p_hlc => 1), pg_temp.pos('{1}', p_hlc => 2)),
                                      pg_temp.pos('{2}', p_hlc => 3))),
          pg_temp.shape(pg_temp.merge(pg_temp.pos('{0}', p_hlc => 1),
                                      pg_temp.merge(pg_temp.pos('{1}', p_hlc => 2), pg_temp.pos('{2}', p_hlc => 3)))),
          'three live edits do not depend on grouping');
select is(pg_temp.shape(pg_temp.merge(pg_temp.merge(pg_temp.pos('{0}', p_version => 1, p_hlc => 1),
                                                    pg_temp.pos('{}', p_version => 2, p_hlc => 2)),
                                      pg_temp.pos('{2}', p_version => 1, p_hlc => 3))),
          pg_temp.shape(pg_temp.merge(pg_temp.pos('{0}', p_version => 1, p_hlc => 1),
                                      pg_temp.merge(pg_temp.pos('{}', p_version => 2, p_hlc => 2),
                                                    pg_temp.pos('{2}', p_version => 1, p_hlc => 3)))),
          'a newer version among three does not depend on grouping');

-- Random rows, crowded so they tie often: two versions, two passes, four
-- clocks, two devices, marks of 1 to 3 bytes, and some deletions at one of
-- two times, so a deleted_hlc can come with either.
create function pg_temp.rand_marks() returns text language sql volatile as $$
  select string_agg(lpad(to_hex(floor(random() * 256)::int), 2, '0'), '')
  from generate_series(1, 1 + floor(random() * 3)::int)
$$;
create function pg_temp.rand_pos() returns public.practice_positions language sql volatile as $$
  select pg_temp.pos(p_marks_hex => pg_temp.rand_marks(),
                     p_version => 1 + floor(random() * 2)::int,
                     p_pass => floor(random() * 2)::int,
                     p_step => floor(random() * 5)::int,
                     p_hlc => floor(random() * 4)::bigint,
                     p_device => (array['a', 'b'])[1 + floor(random() * 2)::int],
                     p_deleted => case when random() < 0.3 then floor(random() * 4)::bigint end,
                     p_deleted_at => '2026-09-22T12:00:00Z'::timestamptz + floor(random() * 2) * interval '5 minutes')
$$;
select setseed(0.4);
create temp table triples as
  select pg_temp.rand_pos() as a, pg_temp.rand_pos() as b, pg_temp.rand_pos() as c
  from generate_series(1, 500);

select is((select count(*) from triples
           where pg_temp.shape(pg_temp.merge(pg_temp.merge(a, b), c))
                 is distinct from pg_temp.shape(pg_temp.merge(a, pg_temp.merge(b, c)))),
          0::bigint, 'grouping never matters: 500 random triples (seed 0.4)');
select is((select count(*) from triples
           where pg_temp.shape(pg_temp.merge(a, b)) is distinct from pg_temp.shape(pg_temp.merge(b, a))),
          0::bigint, 'nor does order');
select is((select count(*) from triples
           where pg_temp.shape(pg_temp.merge(a, a)) is distinct from pg_temp.shape(a)),
          0::bigint, 'and merging a row with itself changes nothing');

-- general
select is(pg_temp.shape(pg_temp.merge(pg_temp.pos('{0,1}', p_step => 5, p_hlc => 1000, p_device => 'phone'),
                                      pg_temp.pos('{2}', p_step => 9, p_hlc => 2000, p_device => 'tablet'))),
          pg_temp.shape(pg_temp.merge(pg_temp.pos('{2}', p_step => 9, p_hlc => 2000, p_device => 'tablet'),
                                      pg_temp.pos('{0,1}', p_step => 5, p_hlc => 1000, p_device => 'phone'))),
          'gives the same result whichever way round the devices merge');
select is(pg_temp.shape(pg_temp.merge(pg_temp.pos('{0,1,2}', p_step => 3), pg_temp.pos('{0,1,2}', p_step => 3))),
          pg_temp.shape(pg_temp.pos('{0,1,2}', p_step => 3)),
          'merging a position with itself changes nothing');
select is((pg_temp.merge(pg_temp.pos(p_version => 1, p_marks_hex => '00'),
                         pg_temp.pos('{0}', p_version => 2))).practice_version,
          2, 'a losing position of a different size does not block the merge');
select is(pg_temp.shape(pg_temp.merge(pg_temp.pos('{0}', p_step => 5, p_id => '00000000-0000-5000-8000-00000000000a'),
                                      pg_temp.pos('{1}', p_step => 9, p_id => '00000000-0000-5000-8000-00000000000b'))),
          pg_temp.shape(pg_temp.merge(pg_temp.pos('{1}', p_step => 9, p_id => '00000000-0000-5000-8000-00000000000b'),
                                      pg_temp.pos('{0}', p_step => 5, p_id => '00000000-0000-5000-8000-00000000000a'))),
          'settles the same way on both devices when the clocks are identical');
select throws_ok($$ select pg_temp.merge(pg_temp.pos(), pg_temp.pos(p_user => '0192a4b0-8c3e-7d4a-9b1f-2e3d4c5b6a7a')) $$,
                 'P0001', null, 'refuses to merge two devotees'' positions for the same practice');
select throws_ok($$ select pg_temp.merge(pg_temp.pos(), pg_temp.pos(p_practice => 'om-namah-shivaya')) $$,
                 'P0001', null, 'refuses to merge positions for different practices');

-- Server only
select is((pg_temp.merge(pg_temp.pos(p_marks_hex => '0100', p_hlc => 1000),
                         pg_temp.pos(p_marks_hex => '02', p_hlc => 2000))).chanted_steps,
          '0300', 'marks of different lengths in one generation: OR-ed, the shorter padded with zeros');
-- Lengths 1, 2, 1 at hlc 1, 2, 3: a pairwise "later row's marks stand" gives
-- different rows for different arrival orders.
select is((select count(distinct pg_temp.shape(pg_temp.merge(pg_temp.merge(o.x, o.y), o.z)))
           from (select pg_temp.pos(p_marks_hex => '01', p_hlc => 1) as a,
                        pg_temp.pos(p_marks_hex => '0200', p_hlc => 2) as b,
                        pg_temp.pos(p_marks_hex => '04', p_hlc => 3) as c) r,
                lateral (values (r.a, r.b, r.c), (r.a, r.c, r.b), (r.b, r.a, r.c),
                                (r.b, r.c, r.a), (r.c, r.a, r.b), (r.c, r.b, r.a)) as o(x, y, z)),
          1::bigint, 'three rows with marks of mixed lengths converge in every arrival order');
select is((pg_temp.merge(pg_temp.merge(pg_temp.pos(p_marks_hex => '01', p_hlc => 1),
                                       pg_temp.pos(p_marks_hex => '0200', p_hlc => 2)),
                         pg_temp.pos(p_marks_hex => '04', p_hlc => 3))).chanted_steps,
          '0700', 'keeping every mark');
select is((pg_temp.merge(pg_temp.pos('{0}', p_step => 5, p_hlc => 1, p_device => 'a-c'),
                         pg_temp.pos('{1}', p_step => 9, p_hlc => 1, p_device => 'ab'))).step_index,
          9, 'hlc compares in byte order: a-c before ab, as compareHlc orders them');
select is((select collation_name from information_schema.columns
           where table_schema = 'public' and table_name = 'practice_positions' and column_name = 'hlc')::text,
          'C', 'which the hlc column''s "C" collation guarantees');

-- The same ids as derivedId, from the same vectors (derivedId.test.ts).
select is(extensions.uuid_generate_v5('49841fbe-b559-4c62-ae52-0d0611052939',
          'v1:profiles:0192a4b0-8c3e-7d4a-9b1f-2e3d4c5b6a79'),
          '5f3f3ea9-d129-519e-91e7-f196cf5b1932'::uuid, 'uuid_generate_v5 matches derivedId: profiles');
select is(extensions.uuid_generate_v5('49841fbe-b559-4c62-ae52-0d0611052939',
          'v1:saved_practices:0192a4b0-8c3e-7d4a-9b1f-2e3d4c5b6a79:vishnu-ashtottara'),
          'f9c3fac2-3d48-5c09-85aa-5b0b70e1f09b'::uuid, 'uuid_generate_v5 matches derivedId: saved_practices');
select is(extensions.uuid_generate_v5('49841fbe-b559-4c62-ae52-0d0611052939',
          'v1:practice_positions:0192a4b0-8c3e-7d4a-9b1f-2e3d4c5b6a79:vishnu-ashtottara'),
          '7f64746d-3241-5ed7-a7b0-cfa9400cad6f'::uuid, 'uuid_generate_v5 matches derivedId: practice_positions');
select is(extensions.uuid_generate_v5('49841fbe-b559-4c62-ae52-0d0611052939',
          'v1:practice_positions:0192a4b0-8c3e-7d4a-9b1f-2e3d4c5b6a79:0192a4b1-0000-7000-8000-000000000001'),
          'fe7cb732-65ef-5a60-80e9-a6ea0a67bd85'::uuid, 'uuid_generate_v5 matches derivedId: custom practice');
select is(extensions.uuid_generate_v5('49841fbe-b559-4c62-ae52-0d0611052939',
          'v1:deity_defaults:0192a4b0-8c3e-7d4a-9b1f-2e3d4c5b6a79:vishnu'),
          'beb30173-fed0-53ad-aec7-992a9617c77d'::uuid, 'uuid_generate_v5 matches derivedId: deity_defaults');

-- merge_practice_position: the upload path.
insert into auth.users (id, email, aud, role) values
  ('0192a4b0-8c3e-7d4a-9b1f-2e3d4c5b6a79', 'a@example.test', 'authenticated', 'authenticated'),
  ('0192a4b0-8c3e-7d4a-9b1f-2e3d4c5b6a7a', 'b@example.test', 'authenticated', 'authenticated');

create function pg_temp.act_as(user_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;

-- A row as the connector uploads it: the device's row, as JSON.
create function pg_temp.upload(p public.practice_positions, patch jsonb default '{}') returns void
language sql as $$
  select public.merge_practice_position(
    (to_jsonb(p) || jsonb_build_object('deleted_at', to_char(p.deleted_at at time zone 'UTC',
                                                             'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')))
    || patch)
$$;

-- `now()` in milliseconds, for clocks that are current.
create function pg_temp.now_ms() returns bigint language sql as $$
  select (extract(epoch from now()) * 1000)::bigint
$$;

create function pg_temp.stored() returns public.practice_positions language sql as $$
  select * from public.practice_positions where id = '7f64746d-3241-5ed7-a7b0-cfa9400cad6f'
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

select pg_temp.act_as('0192a4b0-8c3e-7d4a-9b1f-2e3d4c5b6a79');

select lives_ok($$ select pg_temp.upload(pg_temp.pos('{0,1,2}', p_hlc => pg_temp.now_ms() - 2000)) $$,
                'the first upload of a position stores it');
select lives_ok($$ select pg_temp.upload(pg_temp.pos('{5,6}', p_step => 7, p_hlc => pg_temp.now_ms() - 1000,
                                                     p_device => 'b')) $$,
                'a second device''s upload of the same position');
select is((select chanted_steps from pg_temp.stored()), pg_temp.marks('{0,1,2,5,6}'),
          'is merged into one row with both devices'' marks');
select is((select step_index from pg_temp.stored()), 7, 'with step_index from the later hlc');
select is((select count(*) from public.practice_positions), 1::bigint, 'and no second row');

select lives_ok($$ select pg_temp.upload(pg_temp.pos('{5,6}', p_step => 7, p_hlc => pg_temp.now_ms() - 1000,
                                                     p_device => 'b')) $$,
                'uploading the same row again');
select is((select chanted_steps from pg_temp.stored()), pg_temp.marks('{0,1,2,5,6}'), 'changes nothing');

select lives_ok($$ select pg_temp.upload(pg_temp.pos('{9}', p_hlc => pg_temp.now_ms() + 10 * 60 * 1000)) $$,
                'a row more than 5 minutes ahead is answered with success');
select is((select chanted_steps from pg_temp.stored()), pg_temp.marks('{0,1,2,5,6}'), 'and dropped');

select lives_ok($$ select pg_temp.upload(pg_temp.pos('{9}', p_hlc => pg_temp.now_ms()),
                                         '{"id": "00000000-0000-5000-8000-000000000001"}') $$,
                'a row whose id is not derived from its user and practice is answered with success');
select is((select count(*) from public.practice_positions), 1::bigint, 'and leaves no row');

select lives_ok($$ select pg_temp.upload(pg_temp.pos('{9}', p_hlc => pg_temp.now_ms(),
                     p_practice => '0192A4B1-0000-7000-8000-000000000001',
                     p_id => extensions.uuid_generate_v5('49841fbe-b559-4c62-ae52-0d0611052939',
                       'v1:practice_positions:0192a4b0-8c3e-7d4a-9b1f-2e3d4c5b6a79:0192A4B1-0000-7000-8000-000000000001'))) $$,
                'a non-canonical practice_id, with an id derived from it, is answered with success');
select is((select count(*) from public.practice_positions), 1::bigint, 'and leaves no row');

-- Malformed rows: each dropped with success, leaving the stored row as it was.
select set_config('test.before_malformed', pg_temp.shape(pg_temp.stored()), true);
select lives_ok(format($$ select public.merge_practice_position(%L::jsonb) $$, bad), label)
from (values
  ((to_jsonb(pg_temp.pos(p_hlc => pg_temp.now_ms())) - 'chanted_steps'), 'a missing field'),
  ((to_jsonb(pg_temp.pos(p_hlc => pg_temp.now_ms())) || '{"step_index": "7"}'), 'a wrong type'),
  ((to_jsonb(pg_temp.pos(p_hlc => pg_temp.now_ms())) || '{"step_index": 1.5}'), 'a fractional number'),
  ((to_jsonb(pg_temp.pos(p_hlc => pg_temp.now_ms())) || '{"hlc": "1:2:a"}'), 'an hlc not in text form'),
  ((to_jsonb(pg_temp.pos(p_hlc => pg_temp.now_ms())) || '{"deleted_hlc": "soon"}'), 'a deleted_hlc not in text form'),
  ((to_jsonb(pg_temp.pos(p_hlc => pg_temp.now_ms())) || '{"chanted_steps": "ZZ"}'), 'marks not lowercase hex'),
  ((to_jsonb(pg_temp.pos(p_hlc => pg_temp.now_ms())) || '{"step_index": -1}'), 'a negative step_index'),
  ((to_jsonb(pg_temp.pos(p_hlc => pg_temp.now_ms())) || '{"pass_ordinal": -1}'), 'a negative pass_ordinal'),
  ((to_jsonb(pg_temp.pos(p_hlc => pg_temp.now_ms())) || '{"practice_version": 0}'), 'a practice_version of 0'),
  ((to_jsonb(pg_temp.pos(p_hlc => pg_temp.now_ms())) || '{"deleted_at": "not a time"}'), 'a deleted_at that is not a time'),
  ((to_jsonb(pg_temp.pos(p_hlc => pg_temp.now_ms())) || '{"deleted_at": "2026-09-22T12:00:00.000Z"}'),
   'a deleted_at without a deleted_hlc'),
  ((to_jsonb(pg_temp.pos(p_hlc => pg_temp.now_ms())) || jsonb_build_object('deleted_hlc', pg_temp.h(pg_temp.now_ms()))),
   'a deleted_hlc without a deleted_at')
) as cases(bad, label);
select is(pg_temp.shape(pg_temp.stored()), current_setting('test.before_malformed'),
          'malformed rows leave the stored row as it was');

select performs_ok($$ select pg_temp.upload(pg_temp.pos(p_hlc => pg_temp.now_ms(),
                                                         p_marks_hex => repeat('ab', 1000000))) $$,
                   500, 'an oversized row is answered with success, quickly');
select lives_ok($$ select pg_temp.upload(pg_temp.pos(p_hlc => pg_temp.now_ms(), p_marks_hex => repeat('ff', 513))) $$,
                'marks longer than 512 bytes (4,096 names) are answered with success');
select lives_ok($$ select pg_temp.upload(pg_temp.pos(p_hlc => pg_temp.now_ms(), p_device => repeat('d', 65))) $$,
                'a device id longer than 64 characters is answered with success');
-- Stored first, so the jsonb arrives compressed: its stored size is small, but
-- the row is 100 KB once read.
create temp table compressible as
  select to_jsonb(pg_temp.pos('{7}', p_hlc => pg_temp.now_ms())) || jsonb_build_object('padding', repeat('a', 100000)) as "row";
select ok((select pg_column_size("row") < 4096 from compressible),
          'a compressible oversized row is stored smaller than the limit');
select lives_ok($$ select public.merge_practice_position((select "row" from compressible)) $$,
                'and is answered with success');
select is((select chanted_steps from pg_temp.stored()), pg_temp.marks('{0,1,2,5,6}'),
          'and oversized rows leave the stored row as it was');
select lives_ok($$ select pg_temp.upload(pg_temp.pos(p_hlc => pg_temp.now_ms() - 2500, p_marks_hex => repeat('00', 512))) $$,
                'marks of exactly 512 bytes are still accepted');

select lives_ok($$ select pg_temp.upload(pg_temp.pos(p_step => 500, p_hlc => pg_temp.now_ms() - 3000,
                                                     p_deleted => pg_temp.now_ms() - 500)) $$,
                'a deleted row with a step_index past the step count');
select ok(pg_temp.is_deleted(pg_temp.stored()), 'is kept: the server does not police the upper bound');

select throws_ok($$ select pg_temp.upload(pg_temp.pos(p_hlc => pg_temp.now_ms(),
                                                      p_user => '0192a4b0-8c3e-7d4a-9b1f-2e3d4c5b6a7a')) $$,
                 '42501', null, 'a row for another devotee raises 42501');

select set_config('request.jwt.claims', '', true);
select throws_ok($$ select pg_temp.upload(pg_temp.pos(p_hlc => pg_temp.now_ms())) $$,
                 '42501', null, 'a caller with no user raises 42501');

select set_config('role', 'anon', true);
select throws_ok($$ select public.merge_practice_position('{}') $$, '42501', null,
                 'anon cannot execute the function at all');

-- server_now: how a device learns the server's time, to correct its clock offset.
select throws_ok($$ select public.server_now() $$, '42501', null, 'anon cannot execute server_now');
select set_config('role', 'authenticated', true);
select is(public.server_now(), now(), 'server_now returns the database''s time');

select * from finish();
rollback;
