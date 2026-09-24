# Content

The catalog source: traditions, deities, practices and programs, as YAML. The build turns it into the packs the app downloads. The full rules are in [the content pipeline](../docs/architecture/content-pipeline.md).

```text
traditions/<id>.yaml
deities/<tradition>/<id>.yaml
practices/<tradition>/<primary deity>/<id>.yaml
programs/<id>.yaml
```

- A file's name is its id. The primary deity is the first of a practice's `deity_ids`.
- Write a practice's text in its source script and IAST, in lower case with `ṃ` (not `ṁ`). The build checks each against the other. `latin` and the other scripts are generated.
- Write `latin` by hand only where the common spelling differs from what the rules give, such as "Shri Ram Jai Ram" for श्री राम जय राम. If the text has one, its `words` need one too.
- Any change to a practice's chanted text (a step's text, words or name, or the number of steps) bumps its `version`. Fixing a title, intro or meaning doesn't.
- Leave `review: null` until the advisor has reviewed the practice, then write `review: { advisor, reviewed_on, version }`. A review covers that version only: after a bump, the practice is unreviewed again. Production packs refuse unreviewed content.

Check your changes with `npm run content:validate`. It prints each problem with its file and line. `npm test` runs the same check.
