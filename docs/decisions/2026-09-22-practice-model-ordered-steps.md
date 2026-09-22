---
status: accepted
date: 2026-09-22
---

# One practice model: an ordered list of steps

## Context

The first `Mantra` type assumed one text repeated, usually 108 times. Devotees also chant **namavalis**, such as the Ashtottara Shatanamavali: 108 _different_ names of a deity, each chanted once. From P2 they will read **stotras** such as the Hanuman Chalisa, counted in recitations (paath). Every deity can have several of these practices, and devotees choose favourites among them.

Options considered:

1. **One Practice with ordered steps.** A mantra has 1 step, a namavali has one step per name, a stotra has one per verse.
2. **A separate type per format** (Mantra, Namavali, Stotra). Each simpler alone, but favourites, sankalpas, count events and program days would all need "type + id" references.
3. **A namavali as a playlist of mantras.** Maximum reuse, but it muddles counting (does name 5 also count toward its own mantra?) and makes a 1000-name Sahasranamavali into 1000 mantras.

## Decision

**Option 1.** Every practice has a `kind` (`mantra`, `namavali`, `stotra`) and an ordered list of steps. One pass through the steps is one **repetition**, and **counts are always in repetitions**: a full Ashtottara is 1 recitation, not 108. The devotee's place within a namavali is saved separately and is not a count.

- P1 ships mantras and namavalis. Stotras come in P2.
- Devotees star any number of practices. For each deity, one favourite is the **default**, which the deity page opens on.

Details: [data-model](../architecture/data-model.md).

## Consequences

- Favourites, sankalpas, counts, offerings, programs and sync work the same way for every practice type. Only the allowed chanting modes and how one step is drawn differ by kind.
- Cross-practice views (the annual heatmap) use **names chanted** (repetitions × steps), so one Ashtottara weighs about the same as one mala.
- Fixing a typo in a published practice never changes anyone's history, because counts refer to the practice, not its text.
- The existing `Mantra` type and `mantra_id` fields are renamed before any data exists.
