"""
cleanup_duplicates.py

Removes duplicate medicines from lib/medicines.js
while preserving the CATALOG structure.

Generates duplicates-report.txt
"""

import re
from pathlib import Path
from datetime import datetime

MEDICINES_PATH = Path("lib/medicines.js")
REPORT_PATH = Path("duplicates-report.txt")

js = MEDICINES_PATH.read_text(encoding="utf-8")

def normalize(name: str) -> str:
    """
    Keep dosage numbers.
    CALPOL 120 != CALPOL 250
    """
    n = name.upper()
    n = re.sub(r"[^A-Z0-9 ]", "", n)
    n = re.sub(r"\s+", "", n)
    return n.strip()

all_names = re.findall(
    r'name:\s*"([^"]+)"',
    js
)

cat_ids = re.findall(
    r'id:\s*"([\w-]+)"',
    js
)

total_before = len(all_names) - len(cat_ids)

print(
    f"Medicines before: {total_before}"
)

seen_keys = {}
removed = 0
removed_log = []

def dedup_replacer(match):
    global removed

    full = match.group(0)

    name_match = re.search(
        r'name:\s*"([^"]+)"',
        full
    )

    mrp_match = re.search(
        r'mrp:\s*([\d.]+)',
        full
    )

    if not name_match or not mrp_match:
        return full

    name = name_match.group(1).strip()

    try:
        mrp = round(
            float(mrp_match.group(1)),
            2
        )
    except:
        return full

    key = f"{normalize(name)}|{mrp}"

    if key in seen_keys:

        removed += 1

        removed_log.append(
            f"{name} | ₹{mrp}"
        )

        return ""

    seen_keys[key] = True

    return full

cleaned_js = re.sub(
    r'\{[^{}]*name:\s*"[^"]*"[^{}]*mrp:\s*[\d.]+[^{}]*\},?',
    dedup_replacer,
    js
)

cleaned_js = re.sub(
    r'(\n\s*){3,}',
    '\n\n',
    cleaned_js
)

if "export const CATALOG" not in cleaned_js:
    print(
        "ERROR: CATALOG export missing — aborting."
    )
    exit(1)

MEDICINES_PATH.write_text(
    cleaned_js,
    encoding="utf-8"
)

with open(
    REPORT_PATH,
    "w",
    encoding="utf-8"
) as report:

    report.write(
        "DHIMAN MEDICOS DUPLICATE REPORT\n"
    )

    report.write(
        f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n"
    )

    report.write(
        "=" * 50 + "\n\n"
    )

    if removed_log:

        report.write(
            f"Duplicates Removed: {removed}\n\n"
        )

        for item in removed_log:
            report.write(
                f"REMOVED | {item}\n"
            )

    else:

        report.write(
            "No duplicates found.\n"
        )

total_after = len(
    re.findall(
        r'name:\s*"[^"]+"',
        cleaned_js
    )
) - len(cat_ids)

print(
    f"Medicines before: {len(all_names) - len(cat_ids)}"
)

print(
    f"Medicines after: {total_after}"
)

print(
    f"Duplicates removed: {removed}"
)

print(
    f"Report saved: {REPORT_PATH}"
)
