---
status: active
updated: 2026-09-22
---

# Open questions

Decisions still to make. When one is settled, record it in `decisions/` and remove it here.

## Languages at launch

The audience is open to everyone ([decision](../decisions/2026-09-21-open-audience.md)). Which UI and content languages ship in P1? Candidates: English, Hindi, Nepali, then Tamil, Telugu, Gujarati, Bengali, Marathi, Punjabi (Gurmukhi)…

## Pricing

What stays free forever (core chanting, at minimum) and what is premium. See [partners-and-revenue](features/partners-and-revenue.md).

## Content sourcing

Who records pronunciation audio and writes/reviews articles for each tradition, and under what licence.

## Account age policy

Proposed: accounts for 18+ in India (DPDP Act) and 16+ elsewhere, confirmed by the user; younger devotees use guest mode. Needs a lawyer's confirmation before launch. See [accounts-and-sync](features/accounts-and-sync.md#age-p1-needs-legal-review).

## Sync engine

PowerSync or our own Supabase sync. Decided by spike S4 before local storage is built, against the criteria in [data-model](../architecture/data-model.md#sync-engine).

## Content hosting and transliteration

Where packs and audio are hosted (Supabase Storage or Cloudflare R2), and which transliteration library generates scripts. Decided in the content pipeline milestone ([content-pipeline](../architecture/content-pipeline.md)).
