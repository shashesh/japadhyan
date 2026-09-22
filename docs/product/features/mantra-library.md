---
status: draft
updated: 2026-09-22
phases: P1, P2
---

# Mantra library

The library is organised **by deity**. Each deity has several **practices** a devotee can choose from: mantras, the deity's 108 names, and in P2 stotras. Devotees star their favourites, and each deity opens on the devotee's default ([decision](../../decisions/2026-09-22-practice-model-ordered-steps.md)). Data shapes: [data-model](../../architecture/data-model.md).

## Practice types

| Type         | What it is                                                                                           | Counted in                        | Phase |
| ------------ | ---------------------------------------------------------------------------------------------------- | --------------------------------- | ----- |
| **Mantra**   | One mantra or name repeated: _Om Namah Shivaya_, _Hare Krishna_, _Ram_                               | Repetitions (japa), rounds of 108 | P1    |
| **Namavali** | A list of different names, each chanted once: Ashtottara Shatanamavali (108), Sahasranamavali (1000) | Recitations (paath)               | P1    |
| **Stotra**   | Verses read or recited in order: Hanuman Chalisa, Lingashtakam, Vishnu Sahasranama stotram           | Recitations (paath)               | P2    |

How each type is chanted: [chanting-modes](chanting-modes.md#modes-by-practice-type).

## Deities (P1)

A curated library of the 10–15 most chanted deities at launch, each with its mantras and, where the tradition has one, its **Ashtottara Shatanamavali**. For example:

- Ram — _Sri Ram Jai Ram Jai Jai Ram_; Rama Ashtottara
- Krishna — _Hare Krishna maha-mantra_, _Om Namo Bhagavate Vasudevaya_; Krishna Ashtottara
- Shiva — _Om Namah Shivaya_, Mahamrityunjaya mantra; Shiva Ashtottara
- Devi / Durga — _Om Dum Durgayei Namaha_; Durga Ashtottara; the nine forms of the Navadurga for [Navaratri](festival-programs.md)
- Ganesh — _Om Gam Ganapataye Namaha_; Ganesha Ashtottara
- Hanuman — _Om Hanumate Namah_; Hanuman Ashtottara
- Vishnu / Narayana — _Om Namo Narayanaya_; Vishnu Ashtottara
- Lakshmi, Saraswati — their mantras and Ashtottaras
- Sai — _Aum Sri Sai Ram_; Sai Ashtottara
- Gayatri mantra

Final list to be confirmed with advisors. **Forms and aspects** link to their parent (Shailaputri → Durga → Devi), so the Navadurga can be browsed under Durga.

Each practice includes:

| Field               | Notes                                                                                                                                     |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Text                | In its source script (Devanagari for Sanskrit) and IAST, plus generated scripts: simple Latin, Tamil, Telugu, Kannada, Bengali, Gujarati… |
| Word split          | Mantras only, for [word-by-word tap](chanting-modes.md#word-by-word-tap)                                                                  |
| Names and meanings  | Namavalis: each name with a short meaning                                                                                                 |
| Meaning             | Short translation and explanation                                                                                                         |
| Pronunciation audio | Recorded by a qualified reciter. Downloaded on demand                                                                                     |
| Suggested round     | 108 for a mantra; 1 recitation for a namavali                                                                                             |
| Source and licence  | Where the text comes from; licence of text, transliteration and audio                                                                     |
| Advisor review      | Who reviewed it and when. Unreviewed content never ships                                                                                  |
| Image               | Optional, licensed, and hidden where the tradition says so                                                                                |

Content is authored in the repo and delivered as downloadable packs, with a small core bundled in the app ([content-pipeline](../../architecture/content-pipeline.md)).

## Deity page (P1)

1. **Your favourites** for this deity, with the default selected.
2. The rest, grouped: **Mantras** · **108 Names** · (P2) **Stotras**.
3. (P2) Related festivals and articles.

A deity whose content hasn't been downloaded yet shows "Download to open". Browsing and search work offline.

## Favourites and defaults (P1)

- Star any number of practices, across deities.
- **For each deity, one favourite is the default.** The first practice starred for a deity becomes its default; the devotee can make any other favourite the default. The deity page opens on it.
- Unstarring the default passes it to the next favourite for that deity. With no favourites, the deity page opens on the library's featured practice for that deity.
- **Library → Favourites** lists every starred practice in the devotee's order, with **Recent** (chanted but not starred) below.
- Each saved practice remembers the devotee's own settings: round size, mala style, mode, how often to offer, script, bell.
- The app opens straight to the practice chanted last ([session-experience](session-experience.md#opening-the-app)).
- Starring a practice downloads it for offline use.

## Custom mantras (P1)

- Devotees create their own mantra: text, word split, round size, optional deity, optional image and recording.
- **P2:** custom namavali, pasting names one per line.

## Private guru mantra (P1)

- Count a diksha mantra **without ever typing or storing its words**. Shown only as a name the devotee chooses, e.g. "My guru mantra".
- Chanted by mala tap, silent chanting, volume buttons and manual logging; voice counting (P2) works because its template never leaves the device. Word-by-word and typing are unavailable because they need the words.
- Excluded from any sharing, community or analytics features.

## Growth

- **P2:** stotras (Chalisa, Ashtakam, Sahasranama stotram); Sahasranamavalis; a larger library across more deities and sampradayas.
- **P2:** Sikh, Buddhist and Jain — see [dharmic-traditions](dharmic-traditions.md).
