---
status: draft
updated: 2026-09-22
phases: P1, P2, P3
---

# Chanting modes

The heart of the app: many ways to chant, one count.

## The key rule — one count, many inputs

- Every chanted mode adds repetitions to the **same** total for the active practice and sankalpa. [Listening japa](#listening-japa) is the exception: it has its own total.
- A devotee can **switch modes mid-session** (tap on the bus, voice at home, silent in bed).
- Each count records **which mode** produced it, so progress can show a mode mix ("60% spoken, 30% tap, 10% written").
- A **round** (mala) size is configurable per mantra: 108 (default), 54, 27, 33, or custom. For a namavali, the round is always one recitation.
- What counts as one repetition depends on the practice type: one mantra, or one full recitation of a namavali ([data-model](../../architecture/data-model.md#counting)).

## Summary

| Mode                                                    | Phase | Effort |
| ------------------------------------------------------- | ----- | ------ |
| [Mala tap](#mala-tap)                                   | P1    | easy   |
| [Word-by-word tap](#word-by-word-tap)                   | P1    | easy   |
| [Likhita japa — typing](#likhita-japa)                  | P1    | easy   |
| [Silent chanting (manasika)](#silent-chanting-manasika) | P1    | easy   |
| [Volume-button counting](#hands-free-counting)          | P1    | medium |
| [Flip face down to pause](#hands-free-counting)         | P1    | easy   |
| [Manual log](#manual-log-and-corrections)               | P1    | easy   |
| [Voice counting](#voice-counting)                       | P2    | hard   |
| [Smartwatch](#hands-free-counting)                      | P2    | medium |
| [Chant along](#chant-along)                             | P2    | easy   |
| [Listening japa](#listening-japa)                       | P2    | easy   |
| [Likhita japa — handwriting tracing](#likhita-japa)     | P3    | hard   |
| [Bluetooth rings / smart malas](#hands-free-counting)   | P4    | medium |

## Modes by practice type

Which modes each [practice type](mantra-library.md#practice-types) supports. ~ marks estimated counts.

| Mode                    | Mantra | Private guru mantra | Namavali                 | Stotra (P2) |
| ----------------------- | ------ | ------------------- | ------------------------ | ----------- |
| Mala tap                | P1     | P1                  | P1: bead _n_ is name _n_ | —           |
| Word-by-word tap        | P1     | — (no words)        | —                        | —           |
| Likhita typing          | P1     | —                   | P2                       | —           |
| Silent pace / breath    | P1 ~   | P1 ~                | —                        | —           |
| Volume buttons          | P1     | P1                  | P1: next name            | —           |
| Flip face down to pause | P1     | P1                  | P1                       | P2          |
| Manual log              | P1     | P1                  | P1                       | P2          |
| Voice counting          | P2     | P2                  | —                        | —           |
| Smartwatch              | P2     | P2                  | P2                       | —           |
| Chant along             | P2     | —                   | P2                       | P2          |
| Listening japa          | P2     | —                   | P2                       | P2          |
| Verse-by-verse reading  | —      | —                   | —                        | P2          |

## Namavali: name by name

For an Ashtottara Shatanamavali or other namavali ([mantra-library](mantra-library.md#practice-types)).

- The **current name** is shown large, in the devotee's script, with the transliteration and a short meaning below (the meaning can be hidden).
- The **bead ring** shows the place among the 108 names: bead _n_ is name _n_.
- **Tap anywhere** to chant the name on screen and move to the next; a **back** button goes back one to chant it again.
- The place is **saved after every name**: stop at name 54 and carry on tomorrow, or on another device when signed in.
- A **list view** shows all the names, with the ones already chanted in this recitation marked; tapping one jumps to it. **Jumping never counts a name.**
- A recitation counts only when **every name in it has been chanted**. Tapping the last name with some still unchanted says how many remain and takes the devotee to the first of them.
- When every name is chanted, the [offering moment](session-experience.md#the-offering-moment) comes and **one recitation** is added, once. The next recitation starts at name 1, and back can't return into the finished one.
- If a content update changes the number of names, the saved place resets and the app says why.

## Mala tap

- An on-screen bead ring that advances with each tap.
- **Mala style is the devotee's choice**: Rudraksha, Tulsi, sphatik (crystal), sandalwood, lotus seed, simarna, plain beads and more. Picked at [setup](onboarding.md), suggested by tradition, changeable any time. Never locked behind progress ([decision](../../decisions/2026-09-21-free-flow-nothing-locked.md)).
- Light haptic on every bead; stronger haptic (and optional bell) at the meru bead.
- Tap **anywhere** on the screen so it works with eyes closed.
- Optional: after completing a round, reverse direction (traditional practice of not crossing the meru).

## Word-by-word tap

Inspired by the [Sai app](../../research/inspiration-sai-nama-japam.md).

- The mantra is split into word tiles (e.g. `AUM` `SRI` `SAI` `RAM`).
- Tapping them **in order** completes one repetition; a wrong tile is gently ignored.
- **Memory mode:** tiles hide their words once the devotee knows the mantra.
- Encourages attention — the opposite of a mindless counter.

## Likhita japa

- **Typing (P1):** type the name/mantra in any supported script. Each correct entry is one repetition.
- Completed entries fill pages of a **digital japa book**, like a Rama Koti notebook.
- **Handwriting tracing (P3):** write with a finger; the app checks the shape.
- The book can be **printed and offered at a temple** — see [dedication-and-offering](dedication-and-offering.md).

## Silent chanting (manasika)

- **Pace mode:** the devotee times one repetition once (e.g. 4 seconds); the app estimates the count during silent sitting.
- **Breath mode:** one mantra per breath, guided by a soft visual/haptic pulse.
- Counts from this mode are marked as estimated.

## Voice counting

The headline P2 feature and the hardest to build.

- **Approach:** the devotee records their mantra three times; the app learns that sound pattern and counts repeats of it. This works for any language, accent, or custom mantra — unlike speech-to-text, which handles Sanskrit and regional languages poorly.
- **Entirely on-device and offline.** Audio is never uploaded or stored beyond the session.
- **Confidence indicator** while chanting, and a quick way to correct the count afterward.
- Must handle: fast chanting, background noise, chanting in a group.
- Validate early with a prototype before committing to a design.

## Hands-free counting

Many devotees chant with eyes closed or while walking. Details in [wearables-and-hardware](wearables-and-hardware.md).

- **Volume buttons (P1):** count with the phone in a pocket. Full support on Android; iOS support is limited.
- **Flip face down (P1):** pauses the session.
- **Smartwatch (P2):** Apple Watch and Wear OS, wrist tap per count.
- **Bluetooth japa rings and smart malas (P4).**

## Manual log and corrections

Counts are append-only events, so logging and fixing never edit history ([decision](../../decisions/2026-09-22-grouped-count-events.md)).

- **Manual log (P1):** record practice done elsewhere, e.g. "3 malas on my own beads" or "2 recitations from a book". Entered in malas or repetitions (recitations for a namavali), for today or up to 7 days back. Shown as "logged" in the mode mix.
- **Corrections (P1):** fix mistaken taps or remove a session by adding or subtracting from it. A session's total can never go below zero, even when corrections from two devices are combined. Voice counting (P2) uses the same correction after a session.

## Chant along

- Play a teacher's recording and chant with it; repetitions count as the recording loops.
- Good for beginners learning pronunciation.

## Listening japa

- For illness, travel or tiredness: the mantra plays on a loop.
- Counted **separately** as "listened", not mixed with chanted counts, since traditions differ on how they regard it.
