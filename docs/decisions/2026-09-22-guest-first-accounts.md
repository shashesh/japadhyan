---
status: accepted
date: 2026-09-22
---

# Guest first; accounts are optional and for sync only

## Context

The core app must work offline and without registration. Some devotees want backup and sync across devices. Which deities and mantras someone chants reveals their religion, which is special-category data under GDPR Article 9.

## Decision

- **No account needed, ever.** Guests have the full app; their data stays on the device.
- **Sign-in methods:** Google, Apple and an email one-time code. Apple is required on iOS because we offer Google. Phone sign-in is deferred for cost and fraud reasons.
- **Where it appears:** an "I already have an account" link on the welcome screen, a limited backup offer after a few days of practice, and Settings. Never between opening the app and chanting.
- **Explicit consent** before the first sync.
- **Signing in combines** device and account data without asking; append-only counts make this safe.
- **Signing out clears the device.** Deleting an account is available in the app and on the web, and every other device clears the account's data the next time it connects.
- **Export and import** are available to everyone, including guests.
- No anonymous server accounts: a guest's data is never uploaded without consent.

Details: [accounts-and-sync](../product/features/accounts-and-sync.md).

## Consequences

- Guests risk losing their history if they lose their phone; backup offers and export reduce this.
- Age rules for accounts (18+ in India under the DPDP Act, 16+ elsewhere) need legal confirmation before launch.
