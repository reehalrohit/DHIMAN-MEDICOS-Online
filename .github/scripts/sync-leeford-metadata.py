#!/usr/bin/env python3
"""Sync Leeford public product metadata into Supabase.

Only exact normalized medicine-name matches are written. This script never
changes inventory, batch, MRP, GST, HSN, expiry, purchase price or quantity.
"""
from __future__ import annotations

import os, re, sys, time, json
from urllib.parse import urljoin, urlparse
from urllib.robotparser import RobotFileParser

import requests
from bs4 import BeautifulSoup

BASE = "https://www.leeford.in/"
CATALOG_URL = urljoin(BASE, "products-all")
TABLE = "leeford_product_metadata"
UA = "DHIMAN-MEDICOS-Leeford-Metadata-Sync/1.0 (+https://dhiman-medicos-online.vercel.app/)"
TIMEOUT = 30


def norm(value: str) -> str:
    value = (value or "").upper()
    value = value.replace("&", " AND ")
    value = re.sub(r"[^A-Z0-9]+", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def fetch(session: requests.Session, url: str) -> str:
    r = session.get(url, timeout=TIMEOUT)
    r.raise_for_status()
    return r.text


def allowed_by_robots() -> bool:
    rp = RobotFileParser()
    rp.set_url(urljoin(BASE, "robots.txt"))
    try:
        rp.read()
        return rp.can_fetch(UA, CATALOG_URL)
    except Exception:
        # If robots.txt cannot be read, fail closed rather than bypass it.
        return False


def extract_field(text: str, label: str, next_labels: list[str]) -> str | None:
    labels = "|".join(re.escape(x) for x in next_labels)
    pattern = rf"{re.escape(label)}\s*:?\s*(.*?)(?=\s*(?:{labels})\s*:|$)"
    m = re.search(pattern, text, flags=re.I | re.S)
    if not m:
        return None
    return re.sub(r"\s+", " ", m.group(1)).strip(" |\n\t") or None


def parse_product(url: str, html: str) -> dict:
    soup = BeautifulSoup(html, "html.parser")
    title = soup.find("h1")
    product_name = title.get_text(" ", strip=True) if title else ""
    text = soup.get_text(" ", strip=True)
    text = re.sub(r"\s+", " ", text)

    fields = ["COMPOSITION", "FORMULATION", "STATUS", "DESCRIPTION", "SIDE EFFECTS", "DOSAGE/DIRECTIONS FOR USE"]
    data = {}
    for i, label in enumerate(fields):
        data[label] = extract_field(text, label, fields[i+1:])

    path = urlparse(url).path.rstrip("/").split("/")
    leeford_id = path[-2] if len(path) >= 2 and path[-2].isdigit() else None
    slug = path[-1] if path else None
    return {
        "product_name": product_name,
        "source_url": url,
        "leeford_product_id": leeford_id,
        "slug": slug,
        "composition": data["COMPOSITION"],
        "formulation": data["FORMULATION"],
        "status": data["STATUS"],
        "description": data["DESCRIPTION"],
        "side_effects": data["SIDE EFFECTS"],
        "dosage_directions": data["DOSAGE/DIRECTIONS FOR USE"],
        "raw_source": {k.lower().replace("/", "_").replace(" ", "_"): v for k, v in data.items()},
    }


def supabase_headers(key: str) -> dict:
    return {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}


def get_inventory(session: requests.Session, api: str, key: str) -> list[dict]:
    out = []
    offset = 0
    while True:
        r = session.get(
            f"{api}/rest/v1/inventory",
            params={"select": "medicine_id,medicine_name", "offset": offset, "limit": 1000},
            headers=supabase_headers(key), timeout=TIMEOUT,
        )
        r.raise_for_status()
        rows = r.json()
        out.extend(rows)
        if len(rows) < 1000:
            return out
        offset += 1000


def upsert(session: requests.Session, api: str, key: str, rows: list[dict]) -> None:
    if not rows:
        return
    headers = supabase_headers(key)
    headers["Prefer"] = "resolution=merge-duplicates,return=minimal"
    for i in range(0, len(rows), 100):
        r = session.post(f"{api}/rest/v1/{TABLE}", headers=headers, json=rows[i:i+100], timeout=TIMEOUT)
        r.raise_for_status()


def main() -> int:
    api = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not api or not key:
        print("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY", file=sys.stderr)
        return 2
    if not allowed_by_robots():
        print("Leeford robots.txt does not permit this sync or could not be read; stopping.", file=sys.stderr)
        return 3

    s = requests.Session()
    s.headers.update({"User-Agent": UA, "Accept": "text/html,application/xhtml+xml"})

    catalog = fetch(s, CATALOG_URL)
    soup = BeautifulSoup(catalog, "html.parser")
    links = []
    seen = set()
    for a in soup.find_all("a", href=True):
        href = urljoin(BASE, a["href"])
        p = urlparse(href)
        if p.netloc == "www.leeford.in" and p.path.startswith("/product/"):
            clean = href.split("#", 1)[0].rstrip("/")
            if clean not in seen:
                seen.add(clean); links.append(clean)

    print(f"Leeford product links discovered: {len(links)}")
    inventory = get_inventory(s, api, key)
    exact = {norm(x.get("medicine_name")): x.get("medicine_id") for x in inventory if x.get("medicine_id") and x.get("medicine_name")}
    print(f"Inventory medicine names available for exact matching: {len(exact)}")

    matched, unmatched = [], []
    for idx, url in enumerate(links, 1):
        try:
            product = parse_product(url, fetch(s, url))
        except Exception as exc:
            print(f"WARN product fetch failed {url}: {exc}", file=sys.stderr)
            continue
        medicine_id = exact.get(norm(product["product_name"]))
        if medicine_id:
            matched.append({**product, "medicine_id": medicine_id, "match_method": "exact_normalized_name", "match_confidence": 1.0})
        else:
            unmatched.append({"product_name": product["product_name"], "source_url": url})
        if idx % 25 == 0:
            print(f"Processed {idx}/{len(links)}")
        time.sleep(0.15)

    upsert(s, api, key, matched)
    print(f"Matched and upserted: {len(matched)}")
    print(f"Unmatched Leeford products: {len(unmatched)}")
    with open("leeford-unmatched.json", "w", encoding="utf-8") as f:
        json.dump(unmatched, f, ensure_ascii=False, indent=2)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
