---
status: proposed
date: 2026-09-22
---

# Sync engine: PowerSync, on Sync Streams

Spike **S4**. Recommended, not yet accepted: adopting a paid third-party service is the owner's call, and three of the seven criteria can only be closed by running a prototype.

## Context

Local storage can't be built until the sync engine is chosen, because PowerSync ships its own SQLite layer: building on `expo-sqlite` first would mean migrating twice ([data-model](../architecture/data-model.md#sync-engine)). The candidates were PowerSync and our own Supabase sync, against seven criteria.

Our data is an unusually good fit for off-the-shelf sync: `count_events` and `sessions` are sealed and append-only, inserted by id; the rest is latest-edit-wins ordered by a hybrid logical clock. Nothing is collaborative — every row belongs to exactly one devotee, so a sync stream filtered on `user_id` produces **one bucket per user** with no fan-out.

## Decision

**Use PowerSync Cloud with the Supabase Postgres connector, and write the sync config as Sync Streams from day one.** Sync Rules are deprecated: new Cloud instances are Streams-only from 15 March 2027 and support ends 15 December 2027. Sync Streams have been GA since May 2026, so starting there costs nothing and avoids the migration entirely.

### Against the seven criteria

| #   | Criterion                                    | Verdict                                                                                                                                                                                                       |
| --- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Guest data becomes account data              | **Likely** — `localOnly` tables plus `updateSchema` and `viewName` is a documented recipe with a reference implementation, and it maps onto our re-key step. Demonstrated for React web, **not** React Native |
| 2   | Two devices offline, reconnect, totals exact | **Unproven** — architecturally sound (blocking FIFO queue, server-authoritative checkpoints) but only a prototype closes it                                                                                   |
| 3   | Works on web with offline persistence        | **Qualified** — the Web SDK is GA, but **React Native for Web support is Beta** and needs a second SDK, a Metro resolver override and a `copy-assets` build step                                              |
| 4   | Local queries update the screen live         | **Yes** — React Hooks are GA; `useQuery` plus differential watches, which matter for a screen that writes on every bead                                                                                       |
| 5   | Monthly cost at 10k and 100k users           | **Yes** — ~$67–97/month at 10,000 daily users, ~$1,000–1,400/month at 100,000. Billing is per GB synced, GB hosted, peak concurrent clients and instances; **not** per sync operation                         |
| 6   | How much code we own                         | **Yes** — roughly 150–300 lines plus the sync YAML and setup SQL. Supabase Auth removes the JWT endpoint and the Data API removes the custom write backend                                                    |
| 7   | Conflict rule applied on the server          | **Yes** — Sync Streams govern downloads only, so uploads go through Postgres with RLS, and a conditional "apply only if newer" write is a documented pattern                                                  |

### Why not our own sync

Not because it's impossible — the data model is append-only plus latest-edit-wins, which is the easy case — but because of where the effort lands. Estimated ~6–8 weeks to a happy path and **~18–28 weeks to something trustworthy with a devotee's lifetime chant count**.

The decisive detail: the hardest part isn't the upload queue, it's the **pull cursor**. A timestamp watermark permanently and invisibly skips any transaction that commits after the cursor has read past its timestamp, and our `hlc` can't drive the cursor either because it is client-stamped. Hand-rolling means owning that problem; PowerSync eliminates it structurally, because its checkpoints come from Postgres logical replication rather than a timestamp query.

Nothing else on the market fits. Zero rejects offline writes outright, which is fatal for an app whose whole point is chanting offline. ElectricSQL is read-path only and PGlite doesn't run in React Native. RxDB's production SQLite storage is paid. WatermelonDB's sync protocol mandates abort-on-conflict, the opposite of our accept-and-merge design. Supabase has no offline story and none is arriving.

## Consequences

### Accepted costs

- **A custom dev client is required.** PowerSync's native adapter doesn't run in Expo Go; the Expo Go fallback is alpha and offers no SQLite consistency guarantees. Day-to-day development moves to `expo run:ios` / `run:android` or EAS builds.
- **The web leg is Beta and needs real care.** Both `@powersync/react-native` and `@powersync/web` get installed, Metro needs a `resolveRequest` override per platform, and `copy-assets` must be re-run on every upgrade. There is an official Expo 57 / Expo Router 57 / RN 0.86 demo pinning almost exactly our versions, which is the thing to build from.
- **Part of our security boundary moves into YAML.** PowerSync replicates with `BYPASSRLS`, so RLS does **not** guard the download path — sync stream queries do. RLS still guards the write path through the Data API. The sync config is security-sensitive code and must be reviewed as such. This amends [data-model](../architecture/data-model.md#server-supabase), which currently claims RLS covers reading and writing alike.
- **Version locking is Team-only.** On Pro, PowerSync upgrades our service version on their schedule.

### Design consequences to settle before M3

- **Rows that are unique per devotee need deterministic ids.** `practice_positions`, `saved_practices` and `deity_defaults` are one-per-practice or one-per-deity, so two devices offline must mint the _same_ id for the same logical row. `profiles` is one-per-devotee too: two guest devices signing in to a brand-new account would each upload their own profile. A random UUIDv7 gives two rows, the second upload violates the unique constraint, and a class-23 error is discarded as fatal — losing the row and its marks without a trace, with our merge rule never running. This is not a PowerSync problem; our own sync would hit it too. See [data-model](../architecture/data-model.md#ids-for-rows-that-are-unique-per-devotee).
- **The `hlc` must change on every edit.** An update uploads only its changed columns, so an unchanged `hlc` is invisible to the server's guard.
- **A rejected stale write must answer 2xx.** An error response retries the same upload forever and blocks the queue. Rejecting a stale `hlc` is a normal outcome, not a failure: apply nothing, return success, and the client reverts to the server's value at the next checkpoint.
- **Data hosted is the one cost that grows without bound.** It tracks cumulative registered devotees × lifetime history, not daily users, so churned accounts keep costing money: ~$227/month at 100k users in year one, ~$700 by year three, breaching the plan's default cap. **The fix is ours to design and is not settled.** One option is to sync only recent events and keep older ones on the server, but that alone breaks lifetime totals: `totalCount` and `dailyTotals` are sums over each session's events, and a new device that receives only the recent window can't reconstruct them. Any design must answer three things first — how archived history reaches lifetime totals and the heatmap (for example a server-built rollup of whole archived sessions, floored per session exactly as `totalCount` does); what happens to a late `correction` for a session already archived; and how archiving counts as moving a sealed event rather than deleting it. PowerSync's own time-windowing needs a cron job that rewrites rows, which would violate our sealed-events invariant, so we should not use it.
- **Sign-out must drain the queue first.** `disconnectAndClear()` silently discards pending local mutations; [accounts-and-sync](../product/features/accounts-and-sync.md#signing-out-p1) already requires sealing and waiting for sync, which is the right behaviour. Use the `{ soft: true }` variant so signing back in does not re-download everything.
- **Enumerate tables in the `powersync` publication.** `FOR ALL TABLES` makes the service read every update whether or not it syncs.
- **Set `max_wal_size` and `max_slot_wal_keep_size` to 1 GB.** There is an open issue where idle Supabase projects holding a replication slot grow the WAL until the disk fills — and "opened once a day for a few minutes" is exactly that profile.

### What the prototype still has to show

Criteria 1, 2 and 3. It needs a Supabase project, a PowerSync Cloud instance on the free plan, and a custom dev client:

1. A guest chants offline with `localOnly` tables, signs in, and the counts arrive in the account — on React Native, which the documented recipe has only demonstrated on web.
2. Two devices chant the same practice offline, on the **same `practice_version` and `pass_ordinal`**, reconnect, and `totalCount` is exact while the position converges to one row with the marks unioned. Then again with one device finishing the pass first: the later pass wins, its marks are kept, and the other device's marks are not unioned in.
3. The Expo Router static web export actually serves the worker assets and persists offline, including in Safari.

Also worth asking PowerSync directly: whether Pro's default caps can be raised without the Team base fee, whether their egress reaches Supabase over IPv6 or needs the IPv4 add-on, and whether the React Native New Architecture is supported — their docs say nothing about it, though their own demos run RN 0.86 with it enabled.

## Sources

Checked 2026-09-22: [pricing](https://www.powersync.com/pricing), [feature status](https://docs.powersync.com/resources/feature-status), [phasing out Sync Rules](https://releases.powersync.com/announcements/our-plan-for-phasing-out-sync-rules), [Supabase guide](https://docs.powersync.com/integrations/supabase/guide), [RLS and Sync Streams](https://docs.powersync.com/integrations/supabase/rls-and-sync-streams), [local-only usage](https://docs.powersync.com/client-sdks/advanced/local-only-usage), [handling write validation errors](https://docs.powersync.com/handling-writes/handling-write-validation-errors), [consistency](https://docs.powersync.com/architecture/consistency), [React Native and Expo](https://docs.powersync.com/client-sdks/reference/react-native-and-expo), [React Native Web support](https://docs.powersync.com/client-sdks/frameworks/react-native-web-support), [performance and limits](https://docs.powersync.com/resources/performance-and-limits).
