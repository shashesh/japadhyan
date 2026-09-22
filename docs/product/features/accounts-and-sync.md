---
status: draft
updated: 2026-09-22
phases: P1, P2
---

# Accounts and sync

The app works fully without an account. An account is for **backup and sync across devices**, nothing else ([decision](../../decisions/2026-09-22-guest-first-accounts.md)). Data shapes and sync rules: [data-model](../../architecture/data-model.md#storage-and-sync).

## Guest first (P1)

- On first launch the app creates a **local profile**. Everything the devotee does belongs to it, stays on the device, and is never sent anywhere.
- Everything works as a guest: every chanting mode, the library, favourites, sankalpas, charts, reminders.

## Where sign-in appears (P1)

Never between opening the app and chanting ([vision](../vision.md#guiding-principles)).

- **Welcome screen:** a small "I already have an account" link, so a returning devotee restores their practice instead of starting over ([onboarding](onboarding.md)).
- **Backup offer:** on the session-end or Progress screen, after the 3rd day of practice or at 1,008 repetitions, whichever comes first. At most 3 offers in total. Offered earlier on the web, where browsers can clear stored data. Each offer also mentions export as an alternative.
- **Settings → Account**, always.

## Sign-in methods (P1)

Through Supabase Auth.

| Method                  | iOS                       | Android               | Web          |
| ----------------------- | ------------------------- | --------------------- | ------------ |
| **Google**              | Native Google sign-in     | Native Google sign-in | Redirect     |
| **Apple**               | Native Sign in with Apple | Redirect              | Redirect     |
| **Email one-time code** | 6-digit code, no password | 6-digit code          | 6-digit code |

- **Apple is required on iOS** because we offer Google (App Store guideline 4.8).
- **Email codes, not magic links:** links in a mobile app often open the wrong browser.
- **Web uses redirects**, not popups, because the COOP header needed for offline storage cuts popups off from the page that opened them.
- **Same person, several methods:** Supabase links Google and Apple sign-ins that share a verified email. Apple's "Hide my email" addresses won't match; **P2** adds "Link another sign-in method" in Settings.
- **Phone number (SMS code): later.** Every SMS costs money, and SMS pumping fraud is a real risk.

## Consent before the first sync (P1)

Knowing which deities and mantras someone chants reveals their religion: **special-category data** under GDPR Article 9, and personal data under India's DPDP Act.

- Before anything syncs, a plain-language screen explains what is stored (practices, counts, sankalpas, favourites; private guru mantras only as their label), where, and why, and asks for **explicit agreement**.
- The policy version and date agreed are recorded in `consents`.
- **"Not now"** keeps the devotee as a guest. Nothing is uploaded.

## Age (P1, needs legal review)

India's DPDP Act treats anyone under 18 as a child and requires verifiable parental consent. Proposed for P1: accounts are for **18+ in India and 16+ elsewhere**, confirmed by the user when signing up. Younger devotees use guest mode, which stays on the device. [Kids mode](age-modes-and-accessibility.md#kids-mode) (P3) revisits this. A lawyer must confirm before launch.

## Signing in on a device that already has data

Nothing is asked, and **no count is ever lost**: counts are append-only events, so combining them is always safe. Settings and preferences are different: where the device and the account disagree, one value has to win, as the table shows.

| Data                   | Rule                                                                                                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Count events, sessions | Combined. Ids are unique, so nothing is counted twice                                                                                                                                 |
| Saved practices        | Matched by practice. A practice is a favourite if it's starred on either side; other settings: the latest edit wins ([conflict rule](../../architecture/data-model.md#conflict-rule)) |
| Deity defaults         | The account's value wins                                                                                                                                                              |
| Profile                | The account's value wins                                                                                                                                                              |
| Sankalpas              | Both kept. The devotee can release one                                                                                                                                                |
| Custom practices       | Both kept                                                                                                                                                                             |
| Namavali position      | The latest edit wins                                                                                                                                                                  |

**Order of steps**, so per-user uniqueness (one saved practice per practice, one default per deity, one position per practice) always holds:

1. **Download** the account's data completely. The device's rows keep the local profile id meanwhile. If the download fails, nothing changes and the app retries later.
2. **Combine** on the device, using the table above. Where both sides have a row for the same practice or deity, one row survives: the account's row, updated with the combined values.
3. **Re-key** the device's remaining rows to the account's id.
4. **Upload.** As a backstop, the server applies each write only if it is newer by the [conflict rule](../../architecture/data-model.md#conflict-rule), keyed per user, so a retry can never create a duplicate or undo a newer edit.

Afterwards the devotee sees what happened, e.g. "Added 2,340 repetitions from this device to your account."

A devotee signing in on a fresh install whose account has `onboarded_at` set skips onboarding and lands on their last practice.

## Signing out (P1)

- Signing out first **seals the open count event** and **waits for sync**.
- If some counts can't sync (for example, offline), the devotee chooses:
  - **Wait** and try again when online (the default);
  - **Export** those counts to a file first, then sign out;
  - **Discard** them: the screen shows how many ("12 counts from today will be lost") and asks for confirmation.
- Only then does signing out **remove the account's data from the device** and return to the Welcome screen. This protects privacy on shared family phones. Everything that synced is safe in the account.

## Deleting an account (P1)

Required by both app stores. Google Play also requires a web page for it.

- **Settings → Account → Delete account**, in the app and on the web.
- Deletes the account and all its server data, and signs out every device.
- **On the phone or browser used to delete**, the devotee then chooses: **keep my practice on this device as a guest**, or **erase everything**.
- **Every other device clears the account's data the next time it connects.** The app checks the account whenever it comes online, and a deleted account fails that check. The device then removes the account's data and says why: "This account was deleted, so its practice has been removed from this device." If that device has counts that never synced, the devotee can export them first; nothing else is kept.
- **A device that stays offline** keeps its copy until it next connects. The deletion screen says this plainly.

## Export and import (P1)

For everyone, including guests.

- **Settings → Backup → Export** saves a file with the profile, saved and custom practices, deity defaults, namavali positions, sessions, count events and sankalpas.
- **Import** combines using the same rules as signing in, so importing the same file twice changes nothing.
- The file contains private fields (intentions, private labels), and the export screen says so.

## Web

- Guest data lives in the browser's storage, which the browser can clear. The app asks the browser to keep it and offers backup sooner.
- The site opens offline after the first visit ([data-model](../../architecture/data-model.md#web)).

## Security and privacy

- Every synced record carries its owner's `user_id`. Row-level security on every user table: devotees can only read and write their own rows ([data-model](../../architecture/data-model.md#ownership-and-shared-fields)).
- Count events can be inserted, never updated or deleted, except by deleting the account.
- Private fields never appear in analytics or logs ([data-model](../../architecture/data-model.md#private-fields)).

## Later

- **P2:** link another sign-in method; phone sign-in if the cost and fraud controls allow it.
- **P3:** family and group features ([community](community.md)); kids mode and its consent rules.
