#!/usr/bin/env python3
"""Extract labelled records and banks from six official Info Source pages."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import gzip
from html.parser import HTMLParser
from http.client import IncompleteRead
import json
from pathlib import Path
import re
from shutil import copytree, rmtree
from time import sleep
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
BASE = "https://www.canada.ca/en/"
TBS = BASE + "treasury-board-secretariat/services/access-information-privacy/access-information/info-source/"
SOURCES = {
    "ssc": ("Shared Services Canada", BASE + "shared-services/corporate/about-us/transparency/access-information-privacy/sources-federal-government-employee-information-2026-info-source.html"),
    "cra": ("Canada Revenue Agency", BASE + "revenue-agency/corporate/about-canada-revenue-agency-cra/access-information-privacy-canada-revenue-agency/info-source-appendix.html"),
    "ircc": ("Immigration, Refugees and Citizenship Canada", BASE + "immigration-refugees-citizenship/corporate/transparency/access-information-privacy/info-source/personal-information-banks.html"),
    "fin": ("Department of Finance Canada", BASE + "department-finance/corporate/transparency/access-information-privacy/info-source.html"),
    "tbs": ("Government-wide standard inventories", TBS + "standard-personal-information-banks.html"),
    "classes": ("Government-wide standard inventories", TBS + "standard-classes-records.html"),
}
HEADS = {f"h{level}" for level in range(2, 7)}
LABELS = {
    "description": "description", "purpose": "purpose", "retention and disposal standards": "retention",
    "retention and disposal": "retention", "record number": "record", "class of record number": "record",
    "bank number": "bank", "personal information bank number": "bank",
    "related class of record number": "related", "related record number": "related",
    "record disposition authority": "authority", "rda number": "authority", "tbs registration": "registration",
    "tbs registration number": "registration", "consistent uses": "use", "class of individuals": "audience",
    "document types": "documents", "disclosure summaries": "disclosure", "note": "note", "format": "format",
}
FIELD = re.compile(r"^(" + "|".join(map(re.escape, sorted(LABELS, key=len, reverse=True))) + r")\s*(?::\s*(.*)|$)", re.I)
CODE = re.compile(r"\b(?:[A-Z0-9]{2,7}\s+){0,2}[A-Z]{2,7}\s+\d{3,4}\b")
BANK_CODE = re.compile(r"\b(?:(?:[A-Z]{2,7})\s+)?(?:PPU|PSU)\s+\d{3}\b")
UNSTICK = str.maketrans({"\u200b": "", "\u200c": "", "\u200d": "", "\xa0": " ", "–": "-", "‑": "-"})


class Blocks(HTMLParser):
    def __init__(self):
        super().__init__()
        self.inside = False
        self.active = None
        self.tokens = []
        self.blocks = []
        self.date = ""

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "meta" and attrs.get("name", "").lower() in {"dcterms.modified", "date.modified"}:
            self.date = attrs.get("content", "")
        if tag == "main":
            self.inside = True
        if not self.inside:
            return
        if self.active is None and tag in HEADS | {"p", "li"}:
            self.active = (tag, attrs.get("id", ""))
            self.tokens = []
        elif self.active and tag == "br":
            self.tokens.append("\n")
        elif self.active and tag == "a" and attrs.get("id") and not self.active[1]:
            self.active = (self.active[0], attrs["id"])

    def handle_data(self, text):
        if self.active:
            self.tokens.append(text)

    def handle_endtag(self, tag):
        if tag == "main":
            self.inside = False
        if self.active and tag == self.active[0]:
            text = [" ".join(x.translate(UNSTICK).split()) for x in "".join(self.tokens).splitlines()]
            for line in filter(None, text):
                self.blocks.append((*self.active, line))
            self.active = None


def excerpt(text):
    """Keep a brief source excerpt and index only what will be displayed."""
    return text if len(text) <= 500 else text[:497].rsplit(" ", 1)[0] + "…"


def extract(html, key):
    parser = Blocks()
    parser.feed(html)
    source, url = SOURCES[key]
    records = {}
    title = anchor = field = ""
    values = {}

    def save():
        heading_code = BANK_CODE.search(title)
        banks = CODE.search(values.get("bank", "")) if values.get("bank") else heading_code
        codes = CODE.search(values.get("record", ""))
        match = banks or codes
        desc = values.get("description") or values.get("documents", "")
        if not title or not match or not desc:
            return
        code = match.group()
        if key == "ircc" and code.startswith("PPU "):
            code = "IRCC " + code
        record_type = "Personal Information Bank" if banks else "Class of Records"
        record = {
            "code": code, "title": title, "institution": source, "type": record_type,
            "description": excerpt(desc), "retention": excerpt(values.get("retention", "")),
            "related": values.get("related", "").strip(),
            "link": url + ("#" + quote(anchor) if anchor else ""),
            "modified": parser.date,
        }
        records[(code, title)] = record

    for tag, anchor_id, line in parser.blocks:
        marked = FIELD.match(line)
        if marked:
            field = LABELS[marked[1].lower()]
            value = marked[2] or ""
            if value.strip():
                values[field] = value.strip()
            continue
        if tag in HEADS:
            save()
            title, anchor, field = line, anchor_id, ""
            values = {}
            continue
        if field:
            values[field] = (values.get(field, "") + " " + line).strip()
    save()
    return sorted(records.values(), key=lambda row: (row["institution"], row["title"]))


def acquire(item, local):
    key, (name, url) = item
    if local:
        html = (local / f"{key}.html").read_text(encoding="utf-8")
    else:
        attempts = 4
        for attempt in range(1, attempts + 1):
            try:
                request = Request(url, headers={"User-Agent": "CoolCode Government Memory Map"})
                with urlopen(request, timeout=45) as response:
                    body = response.read(3_000_001)
                if len(body) > 3_000_000:
                    raise ValueError(f"{key} HTML snapshot exceeded expected size at {url}")
                html = body.decode("utf-8")
                break
            except (URLError, TimeoutError, ConnectionError, IncompleteRead) as error:
                print(f"{name} ({key}), attempt {attempt}/{attempts} at {url}: {error}", flush=True)
                retryable = not isinstance(error, HTTPError) or error.code in (408, 429) or error.code >= 500
                if not retryable or attempt == attempts:
                    raise RuntimeError(f"Unable to retrieve {name} ({key}) from {url}") from error
                sleep(2 ** attempt)
    records = extract(html, key)
    if len(records) < 5:
        raise ValueError(f"{url} ({key}) returned {len(records)} labelled records. Check its markup before publishing.")
    print(f"{name} ({key}): {len(records)} labelled records", flush=True)
    return records


PUBLIC_INDEX = "https://coolcode.ca/governmentmemory/records.json"
MAX_INDEX_BYTES = 5_000_000


def source_time(snapshot):
    if snapshot.get("retrievedAt"):
        stamp = datetime.fromisoformat(snapshot["retrievedAt"].replace("Z", "+00:00"))
        if stamp.tzinfo is None:
            raise ValueError("A source retrieval timestamp must include a time zone")
        return stamp
    return datetime.strptime(snapshot["built"], "%Y-%m-%d").replace(tzinfo=timezone.utc)


def verified_export(path):
    with gzip.open(path, "rb") as stream:
        raw = stream.read(MAX_INDEX_BYTES + 1)
    if len(raw) > MAX_INDEX_BYTES:
        raise ValueError("Verified export exceeds the expected index size")
    snapshot = json.loads(raw)
    if not snapshot.get("retrievedAt") or snapshot.get("fallback"):
        raise ValueError("Import requires an export generated by a successful online retrieval")
    captured = source_time(snapshot)
    if captured > datetime.now(timezone.utc) or captured.date().isoformat() != snapshot.get("built"):
        raise ValueError("Inconsistent source retrieval time in the verified export")
    expected = {url: 0 for _, url in SOURCES.values()}
    for row in snapshot["records"]:
        url = row["link"].partition("#")[0]
        if url not in expected or not all(row.get(field) for field in ("code", "title", "description", "type", "institution")):
            raise ValueError("Unexpected source or incomplete record in the verified export")
        expected[url] += 1
    if min(expected.values()) < 5:
        raise ValueError("Verified export must cover all six official inventories")
    request = Request(PUBLIC_INDEX, headers={"Cache-Control": "no-cache", "User-Agent": "CoolCode Government Memory Map"})
    with urlopen(request, timeout=45) as response:
        current = json.load(response)
    if captured <= source_time(current) or (not current.get("retrievedAt") and captured.date().isoformat() <= current["built"]):
        raise ValueError("The public index is already as recent as the supplied export")
    snapshot["snapshotKind"] = "verified-export"
    print(f"Verified {len(snapshot['records'])} records from all six sources, retrieved {snapshot['retrievedAt']}", flush=True)
    return snapshot


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    inputs = cli.add_mutually_exclusive_group()
    inputs.add_argument("--input-dir", type=Path, help="Read saved <source key>.html files")
    inputs.add_argument("--seed", action="store_true", help="Use the checked-in dated source snapshot")
    inputs.add_argument("--official-export", type=Path, help="Publish a newer independently retrieved gzip export")
    args = cli.parse_args()
    if args.seed:
        snapshot = json.loads((ROOT / "data" / "seed.json").read_text(encoding="utf-8"))
        if len(snapshot.get("records", [])) < 250 or not snapshot.get("built"):
            raise ValueError("The bundled source snapshot is incomplete")
        snapshot["fallback"] = True
    elif args.official_export:
        snapshot = verified_export(args.official_export)
    else:
        with ThreadPoolExecutor(max_workers=3) as pool:
            outputs = list(pool.map(lambda item: acquire(item, args.input_dir), SOURCES.items()))
        completed = datetime.now(timezone.utc)
        snapshot = {"built": completed.date().isoformat(), "records": [item for entries in outputs for item in entries]}
        if not args.input_dir:
            snapshot["retrievedAt"] = completed.isoformat(timespec="seconds").replace("+00:00", "Z")
    dist = ROOT / "dist"
    if dist.exists():
        rmtree(dist)
    copytree(ROOT / "web", dist)
    (dist / "records.json").write_text(json.dumps(snapshot, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {len(snapshot['records'])} records", flush=True)


if __name__ == "__main__":
    main()
