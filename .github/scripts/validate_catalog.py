import re
from collections import defaultdict
from pathlib import Path

MEDICINES_PATH = Path("lib/medicines.js")

if not MEDICINES_PATH.exists():
    print("ERROR: lib/medicines.js not found")
    exit(1)

js = MEDICINES_PATH.read_text(encoding="utf-8")

category_pattern = re.compile(
    r'id:\s*"([^"]+)".*?items:\s*\[(.*?)\]',
    re.DOTALL
)

medicine_pattern = re.compile(
    r'name:\s*"([^"]+)".*?mrp:\s*([\d.]+)',
    re.DOTALL
)

medicine_locations = defaultdict(list)
errors = []
warnings = []

total = 0

for cat_match in category_pattern.finditer(js):
    category = cat_match.group(1)
    items_block = cat_match.group(2)

    count = 0

    for med_match in medicine_pattern.finditer(items_block):
        name = med_match.group(1).strip()
        mrp = float(med_match.group(2))

        total += 1
        count += 1

        key = re.sub(r"[^A-Z0-9]", "", name.upper())

        medicine_locations[key].append(category)

        if not name:
            errors.append(
                f"Missing medicine name in {category}"
            )

        if mrp <= 0:
            errors.append(
                f"Invalid MRP for {name}"
            )

    print(f"✓ {category}: {count}")

for med, categories in medicine_locations.items():
    if len(set(categories)) > 1:
        warnings.append(
            f"{med} appears in {sorted(set(categories))}"
        )

print("\n--------------------")
print(f"Total Medicines: {total}")
print("--------------------")

if warnings:
    print("\nWARNINGS:")
    for w in warnings:
        print(f"- {w}")

if errors:
    print("\nERRORS:")
    for e in errors:
        print(f"- {e}")
    exit(1)

print("\n✓ Catalog validation passed")
