# Content

The catalog source: traditions, deities, practices and programs, as YAML. The build turns it into the packs the app downloads. The full rules are in [the content pipeline](../docs/architecture/content-pipeline.md).

```text
traditions/<id>.yaml
deities/<tradition>/<id>.yaml
practices/<tradition>/<primary deity>/<id>.yaml
programs/<id>.yaml
```

- A file's name is its id. The primary deity is the first of a practice's `deity_ids`.
- Write a practice's text in its source script and IAST only. `latin` and the other scripts are generated.
- Any change to a practice's text bumps its `version`.
- Leave `review: null` until an advisor has reviewed the practice. Production packs refuse unreviewed content.

Check your changes with `npm run content:validate`. It prints each problem with its file and line. `npm test` runs the same check.
