---
status: accepted
date: 2026-09-23
---

# Transliteration: vidyut-lipi, with our own rules for `latin`

Accepted by the owner on 2026-09-23, knowing it adds a young, single-maintainer npm package to the content build. The package is installed when the build first generates a script, not before.

## Context

A practice's master text is its source script (Devanagari for Sanskrit, Gurmukhi for Sikh practice) and IAST, both written by hand. The content build generates the rest ([transliteration](../architecture/content-pipeline.md#transliteration)): `latin`, and the Indic scripts the app supports — `tamil`, `telugu`, `kannada`, `bengali`, `gujarati`, `gurmukhi` and `tibetan` (`Script` in `packages/shared/src/types/catalog.ts`). The build is a Node script run locally, so the library runs in Node 22/24 and never ships in the app. The advisor reviews generated text like any other.

We tried four samples — ॐ नमः शिवाय, ॐ श्री विष्णवे नमः, ॐ कृष्णाय नमः, ॐ ऐं ह्रीं क्लीं चामुण्डायै विच्चे — and a few edge cases through every candidate, in a scratch directory outside the repo, on Node 24.13 and Python 3.14.

## Decision

**Generate the Indic scripts with [vidyut-lipi](https://github.com/ambuda-org/vidyut/tree/main/vidyut-lipi), through its WebAssembly build on npm, [`@siva-sh/vidyut`](https://www.npmjs.com/package/@siva-sh/vidyut), pinned to an exact version as a dependency of the content build only. Produce `latin` with our own rules from the IAST, with a hand-written override where the common spelling differs.**

vidyut-lipi is Ambuda's MIT-licensed Rust transliterator, written to reach [Aksharamukha](https://github.com/virtualvinodh/aksharamukha)'s quality with a test suite. On our samples it matched Aksharamukha, the reference, for every P1 script, where `sanscript.js` did not (see below). The WebAssembly build is 1.1 MB, has no dependencies and no install scripts, and runs in Node from ESM once given the `.wasm` bytes.

- **Indic scripts are generated from the source script**, not from IAST, because the source script is what the advisor wrote first.
- **The build checks the two master texts agree:** it transliterates the source script to IAST and fails if that differs from the hand-written IAST, after normalising punctuation. A typo in either shows up before review.
- **Scripts that round-trip are checked by round-tripping.** Tamil, Telugu, Kannada and Gujarati came back to identical Devanagari on every sample, so the build converts each generated text back and fails on any difference. Bengali and Tibetan merge `va` and `ba`, so they can't round-trip and rely on review. IAST is checked by the comparison above, never by reading it back: vidyut-lipi misreads some IAST (below).
- **Tamil uses superscript numerals** for the aspirated and voiced consonants (ப⁴க³வதே), and Grantha letters for ś, ṣ, s, h and j, as Aksharamukha does. If the advisor wants plain Tamil as well, it can be derived by dropping the numerals and marks.
- **Gurmukhi and Tibetan are not generated until P2** (below).

### Sample outputs (vidyut-lipi, from Devanagari)

The four samples above, in order.

- **IAST:** oṃ namaḥ śivāya · oṃ śrī viṣṇave namaḥ · oṃ kṛṣṇāya namaḥ · oṃ aiṃ hrīṃ klīṃ cāmuṇḍāyai vicce
- **Tamil:** ௐ நம꞉ ஶிவாய · ௐ ஶ்ரீ விஷ்ணவே நம꞉ · ௐ க்ருʼஷ்ணாய நம꞉ · ௐ ஐம்ʼ ஹ்ரீம்ʼ க்லீம்ʼ சாமுண்டா³யை விச்சே
- **Telugu:** ఓం నమః శివాయ · ఓం శ్రీ విష్ణవే నమః · ఓం కృష్ణాయ నమః · ఓం ఐం హ్రీం క్లీం చాముణ్డాయై విచ్చే
- **Kannada:** ಓಂ ನಮಃ ಶಿವಾಯ · ಓಂ ಶ್ರೀ ವಿಷ್ಣವೇ ನಮಃ · ಓಂ ಕೃಷ್ಣಾಯ ನಮಃ · ಓಂ ಐಂ ಹ್ರೀಂ ಕ್ಲೀಂ ಚಾಮುಣ್ಡಾಯೈ ವಿಚ್ಚೇ
- **Bengali:** ওঁ নমঃ শিবায় · ওঁ শ্রী বিষ্ণবে নমঃ · ওঁ কৃষ্ণায় নমঃ · ওঁ ঐং হ্রীং ক্লীং চামুণ্ডায়ৈ বিচ্চে
- **Gujarati:** ૐ નમઃ શિવાય · ૐ શ્રી વિષ્ણવે નમઃ · ૐ કૃષ્ણાય નમઃ · ૐ ઐં હ્રીં ક્લીં ચામુણ્ડાયૈ વિચ્ચે
- **Gurmukhi:** ੴ ਨਮਃ ਸ਼ਿਵਾਯ · ੴ ਸ਼੍ਰੀ ਵਿ੍ਣਵੇ ਨਮਃ (ष dropped) · ੴ ਕ੍ਰੁ੍ਣਾਯ ਨਮਃ (ष dropped) · ੴ ਐਂ ਹ੍ਰੀਂ ਕ੍ਲੀਂ ਚਾਮੁਣ੍ਡਾਯੈ ਵਿਚ੍ਚੇ
- **Tibetan:** ༀ་ནམཿ་ཤིབཱཡ · ༀ་ཤྲཱི་བིཥྞབེ་ནམཿ · ༀ་ཀྲྀཥྞཱཡ་ནམཿ · ༀ་ཨཻཾ་ཧྲཱིཾ་ཀླཱིཾ་ཙཱམུཎྜཱཡཻ་བིཙྩེ

### Where the candidates differed

Compared with Aksharamukha 2.3 and `sanscript.js` 1.3.3:

- **Tamil, दुर्गायै:** vidyut-lipi and Aksharamukha write து³ர்கா³யை; `sanscript.js` writes துர்³கா³யை, putting the ³ on ர்.
- **Bengali, य in शिवाय:** vidyut-lipi and Aksharamukha write শিবায়; `sanscript.js` writes শিবায, which a Bengali reader reads as _ja_.
- **IAST, candrabindu in हँसः:** vidyut-lipi and Aksharamukha write ham̐saḥ; `sanscript.js` writes ha~saḥ.
- **Tibetan, श्री:** vidyut-lipi and Aksharamukha stack it as ཤྲཱི; `sanscript.js` writes ཤརཱི, unstacked.
- **Gurmukhi, ष in विष्णवे:** vidyut-lipi drops it (ਵਿ੍ਣਵੇ); Aksharamukha keeps it as ਸ਼਼ (ਵਿਸ਼਼੍ਣਵੇ); `sanscript.js` leaves the Devanagari ष in the Gurmukhi (ਵਿष੍ਣਵੇ).
- **Gurmukhi to IAST, ਵਾਹਿਗੁਰੂ:** vidyut-lipi reads vāhiguṝ, which is wrong; the other two read vāhigurū.
- **ॐ in Gurmukhi:** all three write ੴ.
- **Telugu, Kannada and Gujarati** were identical across all three, apart from Aksharamukha's default "nativize" option writing ణ్డ as ండ.

### Checked against our content

Run on the owner's request before accepting, on the same versions:

- **Our five development mantras:** Devanagari to IAST matches the hand-written IAST in `content/` exactly, for all five.
- **A real typo is caught.** Vaidika Vignanam published वर्शिष्ठान्ते for वर्षिष्ठान्ते in every script for over two years (below). vidyut-lipi turns the typo into varśiṣṭhānte, which differs from the hand-written varṣiṣṭhānte, so our IAST check stops it at build time.
- **Where Vignanam's converter is wrong, vidyut-lipi is right:** Bengali शान्ति → শান্তি (not শাংতি), Bengali य → য়, Gujarati ॐ → ૐ.
- **Seed syllables and clusters** — ह्रीं श्रीं क्लीं, ऐं, त्र्यम्बकं, महागणाधिपतये — convert cleanly to IAST, Tamil and Bengali, and a verse with conjunct nasals round-trips through Telugu, Kannada, Tamil, Bengali, Gujarati, Malayalam and Odia.
- **Speed:** 108 names into six scripts takes about 70 ms.

## How others do it

- **[Vaidika Vignanam](https://vignanam.org/)** offers some 1,200 texts in 19 scripts from one master text. Its converter is its own and undocumented, but the archive shows how it works: in February 2023 the Dakshinamurthy Stotram carried the same typos (तत्वं for तत्त्वं, वर्शिष्ठ for वर्षिष्ठ) in Devanagari, Telugu, Tamil, Kannada, Bengali, Gujarati and its romanisation, and by 2025 all were fixed together. Readers report errors by email and in a [public group](https://groups.google.com/g/vignanam). Its per-script conventions are rules too — nasals become anusvara outside Devanagari, which reads oddly in Bengali — and its romanisation is ISO 15919 with `ch` (ōṃ, vēdāṃścha), with no plain spelling like our `latin`.
- **[Sanskrit Documents](https://sanskritdocuments.org/noteonotherfonts.html)** converts its Devanagari with Aksharamukha and warns that Vedic accents and some special letters come out wrong.
- **Sikh apps** built on [BaniDB](https://docs.shabados.com/gurmukhi-utils/) generate English, Hindi and Shahmukhi from Gurmukhi with their own library, `gurmukhi-utils`. It is the reference to look at for Gurmukhi in P2.

So one master text plus a converter is the norm, and every converter is wrong at the edges. What we add is a hand-written IAST checked against the source, review before publishing, and a reviewed snapshot of every generated script.

## How `latin` is produced

No library produces the spelling devotees know. Aksharamukha and vidyut-lipi offer IAST, ISO 15919, Harvard-Kyoto and ITRANS, all scholarly or ASCII encodings, not "Om Namah Shivaya". So `latin` is ours: a small rule set in the content build that turns the IAST into common spelling, plus a per-text override.

**The rules** keep every vowel the IAST has (no schwa deletion: "Shivaya", not "Shivay"), and:

| IAST            | `latin`                                                                | Example                                        |
| --------------- | ---------------------------------------------------------------------- | ---------------------------------------------- |
| ā ī ū           | a i u                                                                  | nārāyaṇa → Narayana                            |
| ṛ ṝ             | ri                                                                     | kṛṣṇa → Krishna                                |
| ś ṣ             | sh                                                                     | śiva → Shiva                                   |
| c, ch           | ch, chh                                                                | vicce → Vichche                                |
| ṭ ḍ ṇ ṅ ñ       | t d n n n                                                              | cāmuṇḍā → Chamunda                             |
| ṃ m̐             | n before k, g, c, j, ṭ, ḍ, t, d and their aspirates; m everywhere else | śaṃkara → Shankara, oṃ → Om, saṃsāra → Samsara |
| ḥ               | h                                                                      | namaḥ → Namah                                  |
| avagraha, daṇḍa | dropped                                                                | so'ham → Soham                                 |
| every word      | capitalised                                                            | Om Namah Shivaya                               |

With these rules our four samples become **Om Namah Shivaya**, **Om Shri Vishnave Namah**, **Om Krishnaya Namah** and **Om Aim Hrim Klim Chamundayai Vichche**. The rules are a table of IAST and `latin` pairs the advisor approves, with a test for each pair. Conventions that vary by region or community — "Hrim" or "Hreem", "Jnana" or "Gyana" — are the advisor's call, made once in the rules.

**The override** covers what rules can't: colloquial forms such as श्री राम जय राम → "Shri Ram Jai Ram", where the common spelling drops vowels the Sanskrit keeps. A step's `text`, `words` or `name` may carry a hand-written `latin`; when it does, the build uses it instead of the rules, and checks a hand-written `words` has as many words as the IAST.

## Alternatives

- **Aksharamukha.** The best quality and the most options (Tamil subscripts or superscripts, Gurmukhi addak, per-script "nativize"), and the best Gurmukhi of the three. Its licence is AGPL-3.0, which is workable for a build tool whose output is our data and which never ships in the app; the cost is packaging. It is Python only: the latest release (2.3, October 2024) fails to import on Python 3.14 (`from ast import Str`, still on `main`), so the build would need its own pinned Python and a second toolchain beside npm. The npm wrapper [`aksharamukha`](https://www.npmjs.com/package/aksharamukha) runs it in Pyodide: 17 MB plus a 13 MB Pyodide, GPL-3.0, one maintainer, several seconds to start, and on first run it downloaded its Python wheels from a CDN, which a signed-content build shouldn't depend on.
- **[`@indic-transliteration/sanscript`](https://www.npmjs.com/package/@indic-transliteration/sanscript)** (`sanscript.js`). The established JS option: MIT, maintained since 2012, 270 KB, CommonJS; last release 1.3.3, June 2025. But it got Tamil wrong on consonant clusters, wrote Bengali य as য, and mangled candrabindu, Tibetan stacks and Gurmukhi ष. Every one is fixable with post-processing, but that is our own transliterator growing beside a library. It is the fallback if `@siva-sh/vidyut` is abandoned before the build needs an upgrade.
- **vidyut-lipi through its official Python package, [`vidyut`](https://pypi.org/project/vidyut/).** The same engine and the same output (checked on the samples), from the upstream maintainers, but it brings Python into the build for nothing the WebAssembly build lacks.
- **[`indic-transliteration`](https://pypi.org/project/indic-transliteration/)** (Python). Actively released (2.3.82, April 2026), but it shares its mapping tables with `sanscript.js` and adds Python.
- **Others.** [`lipimala`](https://www.npmjs.com/package/lipimala) covers only Devanagari, Gujarati and IAST. Generic transliterators such as [`transliteration`](https://www.npmjs.com/package/transliteration) produce ASCII slugs, not Indic scripts.

## Consequences

- **The npm package is young and unofficial.** Upstream vidyut publishes no npm package. `@siva-sh/vidyut` is a one-maintainer binding built from a fork (0.3.0, August 2026, no provenance attestation); its output matched the official Python binding on the samples we compared. We pin the exact version, upgrade deliberately, and read the diff of generated text on every upgrade. The build runs on the machine that holds the content signing key, so the package's glue code (standard `wasm-bindgen`, no install scripts) is reviewed on each upgrade too. If the binding goes stale, the exits are building the MIT crate to WebAssembly ourselves or falling back to `sanscript.js`; both are contained, because the build's output is checked against the round trip and the reviewed snapshot.
- **vidyut-lipi itself is quiet.** The crate's last release was 0.2.0 in January 2025; the repository is active on its other crates. Transliteration tables change rarely, so this matters less than it would for a parser, but bugs we find may be ours to report and wait on.
- **Schema change, for the owner to approve with the build.** The content schema rejects `latin` today ("generated at build time; write only the source script and IAST"). The override needs it to accept an optional hand-written `latin` in a practice's step `text`, `words` and `name`, and [content-pipeline](../architecture/content-pipeline.md#source-content) to say `latin` is the one generated script that may be overridden. The export schema is unchanged.
- **Generated text needs a reviewable form.** For the advisor to review it and for a library upgrade or rule change to show as a diff, the build should write every generated script to a checked-in snapshot beside the content. Settled with the build script.
- **Does generated text alone bump `version`?** The pipeline says any text change does, and a new version resets saved places in a namavali. A fix to Tamil rendering shouldn't reset a devotee's place. Settled with the build script.
- **Gurmukhi and Tibetan wait for P2.** All three libraries write ॐ as ੴ (Ik Onkar), which must never stand in for a Hindu Om; vidyut-lipi drops ष in Gurmukhi (its table maps it to an empty string) and reads ਰੂ back as ṝ, which matters for Sikh texts whose source is Gurmukhi. Before P2 the advisor chooses the Gurmukhi conventions, we fix or report the table upstream, and Aksharamukha's output is the reference to compare with. Tibetan waits for the Buddhist catalog and its advisor.
- **Tamil needs a few more characters in the font.** The superscript numerals ² ³ ⁴, `ʼ` (U+02BC), `ˮ` (U+02EE) and the visarga `꞉` (U+A789) must render on real phones with the chosen Tamil font, which spike S1 should check.
- **vidyut-lipi misreads ā followed by a separate vowel in IAST.** After a consonant, `sāī` becomes सी instead of साई and `sāu` becomes सु; the official Python package does the same. Devanagari to IAST is correct (साई → sāī), and the build never reads IAST back, so our checks are unaffected. It matters for names such as Sai and Bhai; we report it upstream.
- **Each script's conventions are ours to choose.** vidyut-lipi follows the source spelling: शान्ति stays శాన్తి in Telugu, where Telugu readers usually write శాంతి; Tamil marks anusvara as ம்ʼ; chandrabindu reads oddly in Tamil (हँस → ஹம்ˮஸ). The build applies a small, tested set of rules per script after transliterating, like the `latin` rules, and a reader of that script signs them off before the script ships.
- **IAST is written in lower case with ṃ, not ṁ.** vidyut-lipi garbles capitalised IAST and reads ṁ as a Vedic anusvara (ꣳ). The build rejects both.
- **`@siva-sh/vidyut` goes into [TECH-VERSIONS](../../TECH-VERSIONS.md)** when the build installs it.

## Sources

Checked 2026-09-23: [Vaidika Vignanam on the Wayback Machine](http://web.archive.org/web/20230210050806/https://vignanam.org/devanagari/dakshina-murthy-stotram.html), [vidyut-lipi README](https://github.com/ambuda-org/vidyut/tree/main/vidyut-lipi), [its Gurmukhi table](https://github.com/ambuda-org/vidyut/blob/main/vidyut-lipi/src/autogen_schemes.rs), [crate](https://crates.io/crates/vidyut-lipi), [`vidyut` on PyPI](https://pypi.org/project/vidyut/), [`@siva-sh/vidyut`](https://www.npmjs.com/package/@siva-sh/vidyut) and [its source](https://github.com/sivashaktift/vidyut/tree/dev), [Aksharamukha](https://github.com/virtualvinodh/aksharamukha-python) and [on PyPI](https://pypi.org/project/aksharamukha/), [`aksharamukha` on npm](https://www.npmjs.com/package/aksharamukha), [`sanscript.js`](https://github.com/indic-transliteration/sanscript.js), [`indic-transliteration`](https://github.com/indic-transliteration/indic_transliteration_py).
