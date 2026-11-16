# Government Memory Map

[Open Government Memory Map](https://coolcode.ca/governmentmemory/). Search selected official Info Source inventories for record classes, Personal Information Banks, record numbers and published retention descriptions. Each result links to its source and offers a browser-local outline for a request, plus a topic link into the CoolCode ATIP Records Explorer.

The build covers the English inventories from Shared Services Canada, the Canada Revenue Agency, Immigration, Refugees and Citizenship Canada, Finance Canada and Treasury Board’s two institution-wide standard references. Displayed descriptions and retention details are short excerpts from the attributed official source. Standard entries apply where the institution uses the inventory. Per-entry source dates come from page metadata. A description indicates potential holdings, and availability is determined by the responsible institution.

Run `python3 scripts/build.py` and serve `dist/` over HTTP. The builder uses the Python standard library. For deterministic reruns, save the six HTML sources with filenames `ssc.html`, `cra.html`, `ircc.html`, `fin.html`, `tbs.html` and `classes.html`, then pass `--input-dir /path/to/snapshots`.

Sources are listed in `scripts/build.py`. Reproduction is attributed to the issuing agencies under [Canada.ca terms](https://www.canada.ca/en/transparency/terms.html). This independent, noncommercial tool is unaffiliated with the Government of Canada.
