# Government Memory Map

<!-- coolcode:guide -->
Save relevant record classes or Personal Information Banks, choose one institution, and edit its request outline before copying or downloading it. Government-wide references are optional and need an applicability check against that institution’s inventory.
<!-- /coolcode:guide -->

[Open Government Memory Map](https://coolcode.ca/governmentmemory/). Search selected official Info Source inventories for record classes, Personal Information Banks, record numbers and published retention descriptions. Each result links to its source and offers a browser-local outline for a request, plus a topic link into the CoolCode ATIP Records Explorer.

Use **Save record** to collect references across searches. In **Saved records**, choose an institution and a draft type to make a request outline with the selected references. You can opt in to including government-wide entries for that institution. Check applicability against its inventory. Copy or download the edited outline as text, or download the full saved reference list as Markdown. This workspace stores public codes, titles and source links in your browser. Outline edits live in the dialog and are discarded on close.

The build covers the English inventories from Shared Services Canada, the Canada Revenue Agency, Immigration, Refugees and Citizenship Canada, Finance Canada and Treasury Board’s two institution-wide standard references. Displayed descriptions and retention details are short excerpts from the attributed official source. Standard entries apply where the institution uses the inventory. Per-entry source dates come from page metadata. A description indicates potential holdings, and availability is determined by the responsible institution.

Run `python3 scripts/build.py` and serve `dist/` over HTTP. The builder uses the Python standard library. For deterministic reruns, save the six HTML sources with filenames `ssc.html`, `cra.html`, `ircc.html`, `fin.html`, `tbs.html` and `classes.html`, then pass `--input-dir /path/to/snapshots`.

Every Monday, GitHub Actions retrieves and validates all six pages before deploying. Each successful online build records its UTC retrieval time in `records.json`. If a source is unavailable or its markup fails validation, the job fails and the existing Pages deployment stays available. For an offline build, use `python3 scripts/build.py --seed`. The footer labels this bundled snapshot with its original date.

### Import an independently retrieved official export

When Canada.ca is unreachable from the hosted runner, a maintainer can run the same six-source collector from a network that can reach the official pages. From a clean checkout, run:

```sh
python3 scripts/build.py && gzip -n -c dist/records.json > data/official-export.json.gz
```

Commit that file on `main` to publish the export. The push build checks its original UTC retrieval time, required record fields and coverage of every source, and compares it with the public index. An older or incomplete import stops before deployment. Weekly and manually dispatched refreshes always contact the six official pages.

Run `node --test tests/*.test.mjs` to check reference persistence, recipient scoping and draft exports against the source snapshot.

Sources are listed in `scripts/build.py`. Reproduction is attributed to the issuing agencies under [Canada.ca terms](https://www.canada.ca/en/transparency/terms.html). This independent, noncommercial tool is unaffiliated with the Government of Canada.

<!-- schedule-reliability -->
## Schedule reliability

Public GitHub repositories can have scheduled workflows disabled after 60 days of inactivity. A separate weekly [schedule guard](.github/workflows/schedule-guard.yml) calls GitHub's enable-workflow API for an explicit list of refresh workflows and itself. It can restore workflows disabled for inactivity, preserves manually disabled workflows, and runs independently of collection failures.

This is an interim mitigation, not a scheduling guarantee: GitHub does not document active-workflow renewal as a permanent exemption, and scheduled runs can be delayed or dropped. The independent scheduler on our Linux server triggers overdue refreshes and checks published freshness; its code and current target list live in [the hub repository](https://github.com/jsdyer/jsdyer.github.io/tree/main/services/refresh-watchdog). The guard does not collect data, create dummy commits, or change source/check timestamps; successful collection and published data freshness still need monitoring.
<!-- /schedule-reliability -->

Source requests are bounded by time and size. If the primary HTTPS client has a transport error or a 403/429/server response, the collector tries the same public URL with curl (installed on GitHub runners; optional locally). TLS verification remains enabled. Both clients must obtain a valid response and the existing data validation must pass before a successful check is recorded. If both fail, the previous publication keeps its original dates.
