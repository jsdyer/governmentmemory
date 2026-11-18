# Government Memory Map

[Open Government Memory Map](https://coolcode.ca/governmentmemory/). Search selected official Info Source inventories for record classes, Personal Information Banks, record numbers and published retention descriptions. Each result links to its source and offers a browser-local outline for a request, plus a topic link into the CoolCode ATIP Records Explorer.

Use **Save record** to collect references across searches. In **Saved records**, choose an institution and a draft type to make a request outline with the selected references. You can opt in to including government-wide entries for that institution. Check applicability against its inventory. Copy or download the edited outline as text, or download the full saved reference list as Markdown. This workspace stores public codes, titles and source links in your browser. Outline edits live in the dialog and are discarded on close.

The build covers the English inventories from Shared Services Canada, the Canada Revenue Agency, Immigration, Refugees and Citizenship Canada, Finance Canada and Treasury Board’s two institution-wide standard references. Displayed descriptions and retention details are short excerpts from the attributed official source. Standard entries apply where the institution uses the inventory. Per-entry source dates come from page metadata. A description indicates potential holdings, and availability is determined by the responsible institution.

Run `python3 scripts/build.py` and serve `dist/` over HTTP. The builder uses the Python standard library. For deterministic reruns, save the six HTML sources with filenames `ssc.html`, `cra.html`, `ircc.html`, `fin.html`, `tbs.html` and `classes.html`, then pass `--input-dir /path/to/snapshots`.

Every Monday, GitHub Actions retrieves and validates all six pages before deploying. Each successful online build records its UTC retrieval time in `records.json`. If a source is unavailable or its markup fails validation, the job fails and the existing Pages deployment stays available. For an offline build, use `python3 scripts/build.py --seed`. The footer labels this bundled snapshot with its original date.

Run `node --test tests/*.test.mjs` to check reference persistence, recipient scoping and draft exports against the source snapshot.

Sources are listed in `scripts/build.py`. Reproduction is attributed to the issuing agencies under [Canada.ca terms](https://www.canada.ca/en/transparency/terms.html). This independent, noncommercial tool is unaffiliated with the Government of Canada.
