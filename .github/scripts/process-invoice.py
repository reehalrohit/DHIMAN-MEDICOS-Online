"""
process-invoice.py  v5
──────────────────────
Reads invoice CSVs from invoices/
Categorises by comprehensive keyword + brand name matching (no AI needed)
Deduplicates, cleans names, inserts into lib/medicines.js
Uses an atomic Supabase RPC for batch-aware, idempotent inventory updates
"""

import csv, re, glob, os, json

# ── Category definitions ──────────────────────────────────────────────────────
CATEGORIES = {
    "cold-cough":          "Cold & Cough",
    "pain-relief":         "Pain Relief",
    "heart-bp-sugar":      "Heart / BP / Sugar",
    "stomach-digestion":   "Stomach & Digestion",
    "antibiotics":         "Antibiotics",
    "skin-dermatology":    "Skin / Dermatology",
    "asthma-respiratory":  "Asthma & Respiratory",
    "antifungal":          "Antifungal",
    "wound-care":          "Wound Care / Antiseptic",
    "eye-ear":             "Eye & Ear",
    "thyroid":             "Thyroid",
    "nerve-psychiatric":   "Nerve / Psychiatric",
    "mens-health":         "Men's Health",
    "women-hormonal":      "Women & Hormonal",
    "vitamins-supplements":"Vitamins & Supplements",
    "dental-oral":         "Dental / Oral",
    "injections":          "Injections",
    "baby-child":          "Baby & Child Care",
    "liver-kidney":        "Liver & Kidney",
    "bone-joint":          "Bone & Joint",
    "general":             "General Medicines",
}

# ── Comprehensive brand/keyword map ──────────────────────────────────────────
# Longest/most-specific keywords first for better matching
KEYWORDS = {
    "cold-cough": [
        # Syrups / drops
        "solvin","ambropil","amrox","ascorbil","asthalin expec","asthalin ls",
        "asthalin p drop","asthalin new","asthalind","alkacip","chupp","cozy kid",
        "galirex","kold time","kolddtime","macbery","medler sy","oftiven",
        "rantop","rexcof","trustyl","ambrodil","amrox ls","ascorbil ls",
        "asthalin expectorant","asthalin p drops","levolin expec",
        # Tablets / capsules
        "cheston cold","vicks action","sneecure","sneezy","coldmine","wikoryl",
        "labocof","d cold","cozy plus","koflet","cheridryl","grilinctus",
        "joshina","honitus","bronchicum","piriton","alex sy","easi breathe",
        # Nasal
        "nasopil","nasoclear","otrivin","solvin nasal","nasal spray",
        # Cough specific
        "mucinac","benadryl cough","zedex","trizacet cold","cetramac",
        "sothrex","l-hist mont","strepsils","cofsils",
        # Generic
        "ambroxol","bromhexine","dextromethorphan","chlorpheniramine",
        "phenylephrine nasal","pseudoephedrine",
    ],
    "pain-relief": [
        # Paracetamol brands
        "dolo ","calpol","crocin","paracip","parafast","pacimol","dolospas",
        # NSAID brands
        "combiflam","brufen","nicip","nimulid","nimude","zerodol","fenak",
        "meftal","saridon","wilgesic","ketorol","ultracet","migrafen",
        "flexon","pirox","voveran","acimol","aldigesic","powerflam",
        "intaggesic","dolonex","oxalgin","a-doc","esgipyrin","analgin",
        "diclowin","diclolab","ibugesic","dologesic","mefril spas",
        "ibuggesic","ibuvent","hifenac","troykind","pentalgin",
        # Topical
        "omnigel","moov","volini","rapid gel","fenak plus gel","orthodex",
        "dolokind","ventoran","sumo+ gel","sumogel","rumalaya lin",
        "vicks balm","iodex","zandu balm","tiger balm","dicloran gel",
        # Injections (pain)
        "voveran inj","diclopil","diclomax inj",
        # Generic
        "diclofenac","ibuprofen","nimesulide","naproxen","ketoprofen",
        "aceclofenac","tramadol tab","ketorolac",
    ],
    "heart-bp-sugar": [
        # Statins
        "rosubest","rosulip","lipivent","lipvas","turbovas","rosuvas",
        "atorva","storvas","tonact","aztor","lipicure","rosutor",
        # Antiplatelets
        "ecosprin","clopilet","plagril","deplatt","clopigrel",
        # Beta blockers
        "concor","cardivas","metovent","prolonet","tenolol","atenolol tab",
        "bisoprolol","metoprolol","carvedilol tab",
        # ACE/ARB
        "arbitel","telma","telmik","telirol","telvas","venpres","amlozaar",
        "telpil","hipres","valent","losar","stamlo","amlomed","avacard",
        "amlokind","cardace","ramipril tab","enalapril","lisinopril",
        "neodipine","amlong",
        # Diabetes
        "glimda","glizone","glymat","dapa","vildap","febutax","zoryl",
        "intaglip","glycomet","melmet","okamet","dailyglim","glizid",
        "debifall","diapride","glucobay","jalra","amaryl","glynase",
        "gluconorm","gluformin","trajenta","jardiance","invokana",
        "vogli","januvia","pioz","metformin tab","pioglitazone",
        # Uric acid
        "febutax","zyloric","allopurinol",
        # Nitrates
        "sorbitrate","nitrocontin","isosorbide",
        # Diuretics
        "lasix","fruselac","frusemide","furosemide tab",
        # Antiarrhythmic
        "amiodar","amiodarone",
        # Cholesterol
        "carni-q","coq10","ubidecarenone",
    ],
    "stomach-digestion": [
        # PPIs
        "pan d","pantosec","pantovent","pantafol","nupenta","omee",
        "omesec","omey","ocid","esomefol","piltop","rzole","rabesec",
        "rabelet","omeprazole cap","esomeprazole","pantoprazole tab",
        "rabeprazole","nexpro",
        # H2 blockers
        "rantac","ranimax","histac","aciloc","topcid","ranitidine tab",
        # Antacids
        "gelusil","mucaine","gasfizz","oxecaine","digene","dynacid",
        "omee mps","pan mps","freelex","histac mps","omni mps",
        # Laxatives
        "picolex","picovent","piclin","dulcoflex","cremaffin","livoluk",
        "easylax","isabgol","duphalac","lactulose",
        # Anti-motility
        "lopamide","eldoper","norflox tz","ornidazole",
        # Enzymes
        "unienzzyme","unienzyme","bestozyme","aristozyme","digeplex",
        # Anti-emetics
        "ondapil","nausipil","perinorm","emeset sy","vomikind",
        # Antispasmodics
        "spasmonil","librax","buscogast","normaxin","meftal spas",
        # Metronidazole
        "metrogyl","flagyl","metronidazole tab",
        # Others
        "smecta","sucralfate tab","rifagut","coligut","gastovent",
        "electral","ors ","zandu nityam","zandu panch","gastrovent",
        "gasex tab","pudin hara","colicaid drop","neo-enteqnol","eno ",
        "pantovent lsr","enterolium","picolex sy",
    ],
    "antibiotics": [
        # Penicillins/Amoxicillin
        "augmentin","amoxyclav","hexament","moxikind","moxilanta","moxipil",
        "campicil","cipmox","ronemox","amoxicillin cap","amox-clav",
        # Macrolides
        "azicip","azee","zithromac","erythro","erycon","clarithromycin",
        # Cephalosporins
        "sporidex","cephalkem","taxim","monocef","macpod","safexim",
        "cefpil","cefpodoxime","cephalexin cap","cefixime tab",
        # Fluoroquinolones
        "norflox","norfloxem","norflokem","ciprobid","oflot","levoflox",
        "moxiflox","cipzen","qmax","zyrik","cifran","ciprofloxacin",
        # Tetracyclines
        "resteclin","doxy","minoz","doxycycline cap","tetracycline",
        # Sulfonamides
        "trimazole","bactrim","cotrimoxazole",
        # Other antibiotics
        "ventimox","laboclox","alertriz","ornof","clavam","powergyl",
        "linezolid","metronidazole","tinidazole","secnidazole",
        "ofloxacin","levofloxacin","moxifloxacin",
    ],
    "skin-dermatology": [
        # Steroids/Combos
        "betnovate","fucibet","dermi 5","fourderm","quadrid","cosvate",
        "decaderm","dermiford","dermikem","dexoderm","diprobate","elosone",
        "lobate","panderm","sriderm","tenovate","terabet","luliford",
        "halobate","clobetasol","mometasone cream","fluticasone cr",
        # Anti-acne
        "clinsol","deriva","acnelak","benzoyl peroxide","adapalene",
        "no scars","roop mantra",
        # Anti-itch
        "itchguard","ring guard","candid-b","candiderm","clocip b",
        "fungnilb","skin shine","smuth","terbicip cr",
        # Moisturisers / fairness
        "lacto calamine","calamine","kojivit","l sys cream","medisalic",
        "castor nf","sunshade","sunscreen","soframycin skin",
        # Specific
        "thrombotas","liplite","foot guard","lulitec","p-6 cream",
        "candid powder skin","candid-b cr","quadriderm",
    ],
    "asthma-respiratory": [
        # Inhalers
        "asthalin inhaler","aerocort","seroflo","foracort","tiova",
        "budecort","duolin","ipravent","budamate","buderon",
        "levolin respule","asthalin respule","pulmosmart","rotacap",
        # Tablets
        "montewok","montiride","deriphyllin","doxofylline","theophyl",
        "allegra 120","levocetirizine","asthalind",
    ],
    "antifungal": [
        # Systemic
        "itromed","itravent","itromax","itrostred","sporanox","fluconaz",
        "fluka","terbicip tab","griseofulv","ketoconazole tab","fcn tab",
        # Topical
        "ketomac","ketofly","candidac","candid gold","clocip dust",
        "nizoral cr","canesten","clotrimazole cr","miconazole cr",
        "fungnil-b","candid tv","candidac tv",
        # Anti-lice
        "head lice","medilice","scaboma",
    ],
    "wound-care": [
        "betadine","cipladine","cipladin","healodine","labodine","burnheal",
        "povipil","povidon","fixon","neosporin","boroline","soframycin wound",
        "silver sulfa","framycetin","hydrogen perox","iodine solution",
        "medispirit","acriflavine","povidone iodine",
    ],
    "eye-ear": [
        # Eye drops
        "ciplox d","ciplox eye","oflokem","moxicip","vigamox","optibex",
        "tobramycin eye","refresh tear","prednisolone eye","chlorovue",
        # Ear drops
        "clearwax","earwel","soliwax","waxsol","otek ac","otomize",
        # General ophthalmic
        "ophthalmic","eye drop","eye oint","ear drop",
    ],
    "thyroid": [
        "thyronorm","eltroxin","neomercaz","thyrox","propylth",
        "levothyroxine","carbimazole","propylthiouracil","thyroid tab",
    ],
    "nerve-psychiatric": [
        # Anticonvulsants
        "gabator","oxetol","pregabalin","gabapentin","valproate","epilex",
        # Antidepressants
        "depsonil","nexito","rexipra","mirtaz","fluoxetine","sertraline",
        "escitalopram","amitriptyline",
        # Antipsychotics
        "oliza","olanzapine","risperidone",
        # Benzodiazepines
        "zapiz","lonazep","alzolam","etizola","clonazepam","alprazolam",
        # Steroids (nerve)
        "decacortil","deflacortil","dezacort","wysolone","omnacortil",
        "betnesol","dexona","methylprednisolone",
        # Neuropathy
        "meganeuron","neurobion forte","mecofol tab","methycobal",
    ],
    "mens-health": [
        # ED
        "manforce","vigore","zeagra","megalis","tadalafil tab","sildenafil",
        "vardenafil","duratia","long drive",
        # BPH / Hair
        "urimax","prostagard","finpecia","finasteride","tamsulosin",
        # Testosterone
        "retesto","deca durab","deca insta",
        # Condoms
        "condom","durex","manforce cond","unfold condom","vigore cond",
        "moods","kohinoor","skore","playgard",
        # Vitality
        "tentex forte","himcolin","speman","confido",
    ],
    "women-hormonal": [
        # Contraceptives
        "primolut","miss me","unwanted 72","i-pill","ipill",
        # Vaginal
        "leezole","candid v","vwash","clindamycin vaginal","canesten v",
        # Hormones
        "meprate","duphaston","deviry","regestrone","clomid","folitrax",
        "progesterone cap","norethisterone","medroxyprogesterone","clomiphene",
        # Pregnancy tests
        "i-can","prega news","prega sure","mankind preg","clear blue",
        "pregnancy test","amigest card",
        # Supplements for women
        "iron folic","fe folic","m2 tone","evecare","shatavari",
    ],
    "vitamins-supplements": [
        # Vitamins
        "evion","limcee","vitamin c tab","vitamin d3","vitamin a cap",
        "vitamin b12 tab","becosule","becozym-c","belar forte","beplex",
        "neurobion forte tab","zincovit","maxirich","revital","revital-h",
        # Iron
        "fericip","hemo plus","rbc red","hb ford","dexorange",
        "ferrous sulph","haem-up","feronia","orofer","haemup",
        # Calcium / Bone
        "shelcal","calcirol","calcium sandoz","cetjoint","cipcal d3",
        "calciquick","ostocalcium","calcium tab",
        # Omega / protein
        "omega-3","platogrow","protimed","bournvita","glucose d",
        "glucose c","horlicks","complan","ovaltine",
        # B-complex
        "b complex","mecofol","roghan badam","dabur honey","dabur chyaw",
        "chyawanprash","ashwagandha",
        # Multivitamins
        "multivitamin","supradyn","centrum","a to z","at-once",
        # Blood / haemoglobin
        "dexorange sy","hemofer","feronia xt","fefol",
    ],
    "dental-oral": [
        "orasorfe","oravent","sensodent","dologel","zytee","hexigel",
        "chlorhex mouthwash","sualin","clove oil","emoform","sensopil",
        "listerine","toothpaste","mouthwash","mouth gel","oral gel",
        "metrogyl dental","kenalog oral","colgate sensitive","sensodyne",
    ],
    "baby-child": [
        "gripe water","janam ghunti","wimzyme","colicaid drop",
        "calpol paed","calpol 120","crocin drop","lal tail",
        "ibuvent plus","ibugesic plus sy","cheridryl junior","cozy kid",
        "sothrex junior","bendex susp","ascorbil ls drop","nasopil paed",
        "lactogen","nancare","woodwards","otrivin paed","baby ",
        "infant ","neopeptine","pedialyte","cerelac","farex",
    ],
    "liver-kidney": [
        "liv-52","livcare","livergen","livolin","udiliv","silybon",
        "essentiale","hepamerz","neeri","cystone","uriride","monorin",
        "potklor","ursodeoxycholic","silymarin","hepsyl","livclear",
        "himsra","jigrine","liv.52","phyllanthus","katuki",
    ],
    "bone-joint": [
        "rumalaya lin","tiger balm","zandu balm","iodex balm",
        "shelcal 500","calcirol sachet","cetjoint k2","colchicine tab",
        "mobizox tab","debifall","calcium carb","vitamin d3 sachet",
        "alphacalcidol","calcitriol","teriparatide","alendronate",
        "risedronate","zoledronic",
    ],
    "injections": [
        " inj"," injection","vial","amijkect","cobafasst","stancort",
        "oxytetrac vial","ampule","ampoule","iv fluid","ringer",
        "dextrose inj","normal saline","mannitol inj","dexamethasone inj",
        "hydrocortisone inj","methylpred inj","ondansetron inj",
        "tramadol inj","ketorolac inj","diclofenac inj","paracetamol inj",
        "vitamin b12 inj","iron sucrose","ferric carbox",
    ],
}

# ── Name cleaning ─────────────────────────────────────────────────────────────
def clean_medicine_name(name: str) -> str:
    n = str(name).strip()
    n = n.replace("`", "")
    n = re.sub(r"\s*1\s*\*\s*\d+\s*", " ", n)
    n = re.sub(
        r"\s*\([^)]*\b(BOX|SCHEME|GIFT|PLAN|DISCOUNT|POUCH|FREE|DETTOL|STRIP|WFI)\b[^)]*\)",
        "", n, flags=re.IGNORECASE)
    n = re.sub(r"\s*\((NEW|OLD|PLAN)\)", "", n, flags=re.IGNORECASE)
    n = re.sub(r"\s{2,}", " ", n)
    return n.strip().upper()


def normalize_for_dedup(name: str) -> str:
    """Keep dosage numbers — CALPOL120MG ≠ CALPOL250MG."""
    n = clean_medicine_name(name)
    n = re.sub(r"[^A-Z0-9 ]", "", n)
    n = re.sub(r"\s+", "", n)
    return n.strip()


def parse_mrp(value) -> float | None:
    try:
        v = round(float(str(value).strip()), 2)
        return v if v > 0 else None
    except: return None

def parse_purchase_rate(row) -> float | None:
    """
    Calculate net purchase rate per unit from the invoice.

    Preferred source:
      FTRATE = purchase/base rate
      DIS    = percentage discount

    Net rate = FTRATE - (FTRATE * DIS / 100)

    If discount is unavailable, FTRATE is used directly.
    """
    raw_rate = first_value(
        row,
        (
            "FTRATE",
            "FT RATE",
            "F.T.RATE",
            "PURCHASE RATE",
            "PURCHASE_PRICE",
            "PURCHASE PRICE",
            "RATE",
            "RATE/UNIT",
            "RATE PER UNIT",
        ),
    )

    if not raw_rate:
        return None

    try:
        rate = float(
            str(raw_rate)
            .replace(",", "")
            .replace("₹", "")
            .strip()
        )

        if rate <= 0:
            return None

        raw_discount = first_value(
            row,
            (
                "DIS",
                "DISC",
                "DISCOUNT",
                "DISCOUNT %",
                "DIS%",
            ),
        )

        discount = 0.0

        if raw_discount:
            discount_text = (
                str(raw_discount)
                .replace("%", "")
                .replace(",", "")
                .strip()
            )

            try:
                discount = float(discount_text)
            except ValueError:
                discount = 0.0

        discount = max(0.0, min(discount, 100.0))

        net_rate = rate * (1 - discount / 100)

        return round(net_rate, 2)

    except (TypeError, ValueError):
        return None


# ── Categoriser (keyword only — no AI, no delays) ─────────────────────────────
def categorise(name: str) -> str:
    nl = name.lower()
    for cat_id, keywords in KEYWORDS.items():
        for kw in keywords:
            if kw in nl:
                return cat_id
    return "general"


# ── Inventory / Supabase helpers ──────────────────────────────────────────────
import hashlib
from urllib import request, error

MEDICINES_PATH = "lib/medicines.js"
PROCESSED_INVOICES_PATH = ".github/processed-invoices.json"

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")


def medicine_key(name: str) -> str:
    """Must match lib/inventory.js medicineKey()."""
    return re.sub(r"^-+|-+$", "", re.sub(r"[^A-Z0-9]+", "-", str(name or "").strip().upper()))


def normalise_header(value: str) -> str:
    """Normalise vendor-export headings so minor punctuation/case changes do not break imports."""
    return re.sub(r"[^A-Z0-9]+", "", str(value or "").strip().upper())


def normalise_row(row: dict) -> dict:
    """Return both original and normalised keys so every source column remains available."""
    result = dict(row)
    for key, value in row.items():
        result[normalise_header(key)] = value
    return result


def first_value(row, names):
    """Return the first non-empty value from a list of possible headings."""
    for name in names:
        candidates = (name, normalise_header(name))
        for candidate in candidates:
            value = row.get(candidate)
            if value is not None and str(value).strip():
                return str(value).strip()
    return ""


def parse_number(value, fallback=None):
    if value is None:
        return fallback
    text_value = str(value).strip().replace(",", "").replace("₹", "").replace("%", "")
    if text_value == "":
        return fallback
    try:
        return float(text_value)
    except (TypeError, ValueError):
        return fallback


def parse_date(value):
    """Parse common pharmacy invoice dates without inventing a date when ambiguous."""
    if not value:
        return None
    value = str(value).strip()
    formats = (
        (r"^(\d{2})[-/](\d{2})[-/](\d{4})$", "%d-%m-%Y"),
        (r"^(\d{4})[-/](\d{2})[-/](\d{2})$", "%Y-%m-%d"),
        (r"^(\d{2})[-/](\d{2})[-/](\d{2})$", "%d-%m-%y"),
    )
    from datetime import datetime
    for pattern, fmt in formats:
        if re.match(pattern, value):
            try:
                return datetime.strptime(value.replace("/", "-"), fmt).date().isoformat()
            except ValueError:
                return None
    return None


def parse_expiry(row) -> str | None:
    """Preserve the invoice expiry text exactly; also capture an optional parsed ISO date."""
    value = first_value(row, (
        "EXPIRY", "EXPIRY DATE", "EXP DATE", "EXP.DATE",
        "EXP", "EXP.", "EXPIRYDATE"
    ))
    return value or None


def parse_expiry_date(row):
    raw = parse_expiry(row)
    if raw:
        parsed = parse_date(raw)
        if parsed:
            return parsed
    raw_expdt = first_value(row, ("EXPDT", "EXP DT", "EXPIRYDT"))
    if raw_expdt:
        return parse_date(raw_expdt)
    day = first_value(row, ("EXPDAY",))
    month = first_value(row, ("EXPMONTH",))
    year = first_value(row, ("EXPYEAR",))
    if day and month and year:
        try:
            if len(year) == 2:
                year = f"20{year}"
            from datetime import date
            return date(int(year), int(month), int(day)).isoformat()
        except ValueError:
            return None
    return None



def parse_quantity(row) -> int:
    """Parse purchased QTY for stock movements without inventing units from free quantity."""
    value = parse_number(first_value(row, ("QTY",)), 0) or 0
    if value <= 0:
        return 0
    whole = int(value)
    fraction = value - whole
    return whole + 1 if fraction > 0.5 else whole


def parse_batch_no(row) -> str:
    return first_value(row, (
        "BATCH", "BATCH NO", "BATCH NO.", "BATCH NUMBER",
        "BATCHNO", "BATCH_NO", "B.NO", "B.NO."
    )).upper()


def file_sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def row_source_key(file_digest: str, row_number: int) -> str:
    return hashlib.sha256(f"{file_digest}:{row_number}".encode("utf-8")).hexdigest()


def load_processed_invoices() -> dict:
    if not os.path.exists(PROCESSED_INVOICES_PATH):
        return {}
    try:
        with open(PROCESSED_INVOICES_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data if isinstance(data, dict) else {}
    except (json.JSONDecodeError, OSError):
        return {}


def save_processed_invoices(data: dict) -> None:
    os.makedirs(os.path.dirname(PROCESSED_INVOICES_PATH), exist_ok=True)
    with open(PROCESSED_INVOICES_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, sort_keys=True)
        f.write("\n")


def supabase_request(method: str, path: str, payload=None, prefer=None):
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured as GitHub Actions secrets/environment variables."
        )

    url = f"{SUPABASE_URL}/rest/v1/{path}"
    headers = {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
    }
    if prefer:
        headers["Prefer"] = prefer

    body = None if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = request.Request(url, data=body, headers=headers, method=method)

    try:
        with request.urlopen(req, timeout=60) as response:
            raw = response.read().decode("utf-8")
            return json.loads(raw) if raw else None
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Supabase request failed ({exc.code}) {method} {path}: {detail}") from exc


def invoice_source_payload(row: dict, raw_row: dict, *, invoice_file: str, digest: str, row_number: int, source_row_key: str):
    """Extract every known vendor invoice field plus the untouched raw row."""
    supplier = first_value(row, ("SUPPLIER", "SUPPLIER NAME", "VENDOR", "VENDOR NAME"))
    invoice_no = first_value(row, ("BILL NO.", "BILL NO", "INVOICE NO", "INVOICE NUMBER", "BILL NUMBER"))
    invoice_date = first_value(row, ("DATE", "INVOICE DATE", "BILL DATE"))
    company = first_value(row, ("COMPANY", "MANUFACTURER", "MFR", "COMP"))
    item_code = first_value(row, ("CODE", "ITEM CODE", "PRODUCT CODE", "SKU"))
    barcode = first_value(row, ("BARCODE", "EAN", "GTIN"))
    item_name = first_value(row, ("ITEM NAME", "ITEM", "PRODUCT NAME", "MEDICINE NAME"))
    pack = first_value(row, ("PACK", "PACKING", "PACK SIZE"))
    batch = parse_batch_no(row)
    expiry = parse_expiry(row)
    qty = parse_number(first_value(row, ("QTY",)))
    free_qty = parse_number(first_value(row, ("F.QTY", "FQTY", "FREE QTY", "FREE QUANTITY")))
    halfp = parse_number(first_value(row, ("HALFP", "HALF P", "HALF PACK")))
    ftrate = parse_number(first_value(row, ("FTRATE", "FT RATE", "F.T.RATE")))
    srate = parse_number(first_value(row, ("SRATE", "SALE RATE", "SELLING RATE")))
    mrp = parse_mrp(first_value(row, ("MRP", "MAX RETAIL PRICE")))
    discount = parse_number(first_value(row, ("DIS", "DISC", "DISCOUNT", "DISCOUNT %")))
    excise = parse_number(first_value(row, ("EXCISE",)))
    vat = parse_number(first_value(row, ("VAT",)))
    additional_vat = parse_number(first_value(row, ("ADNLVAT", "ADNL VAT", "ADDITIONAL VAT")))
    line_amount = parse_number(first_value(row, ("AMOUNT", "LINE AMOUNT", "NET AMOUNT")))
    local_cent = first_value(row, ("LOCALCENT", "LOCAL CENT")) or None
    scm1 = parse_number(first_value(row, ("SCM1", "SCHEME1", "SCHEME 1")))
    scm2 = parse_number(first_value(row, ("SCM2", "SCHEME2", "SCHEME 2")))
    scmper = parse_number(first_value(row, ("SCMPER", "SCHEME %", "SCHEME PERCENT")))
    custcode = first_value(row, ("CUSTCODE", "CUSTOMER CODE")) or None
    invday = parse_number(first_value(row, ("INVDAY",)))
    invmonth = parse_number(first_value(row, ("INVMONTH",)))
    invyear = parse_number(first_value(row, ("INVYEAR",)))
    expday = parse_number(first_value(row, ("EXPDAY",)))
    expmonth = parse_number(first_value(row, ("EXPMONTH",)))
    expyear = parse_number(first_value(row, ("EXPYEAR",)))
    suppcode = first_value(row, ("SUPPCODE", "SUPPLIER CODE")) or None
    invoice_amount = parse_number(first_value(row, ("INV.AMT", "INV AMT", "INVOICE AMOUNT", "BILL AMOUNT")))
    cgst_rate = parse_number(first_value(row, ("CGST", "CGST %")))
    sgst_rate = parse_number(first_value(row, ("SGST", "SGST %")))
    igst_rate = parse_number(first_value(row, ("IGST", "IGST %")))
    hsn_code = first_value(row, ("HSNCODE", "HSN CODE", "HSN")) or None
    cgst_amount = parse_number(first_value(row, ("CGSTAMT", "CGST AMOUNT")))
    sgst_amount = parse_number(first_value(row, ("SGSTAMT", "SGST AMOUNT")))
    igst_amount = parse_number(first_value(row, ("IGSTAMT", "IGST AMOUNT")))
    expdt = first_value(row, ("EXPDT", "EXP DT", "EXPIRY DT")) or None
    custordno = first_value(row, ("CUSTORDNO", "CUSTOMER ORDER NO", "CUSTOMER ORDER NUMBER")) or None
    psrlno = first_value(row, ("PSRLNO", "PURCHASE SERIAL NO", "PURCHASE SERIAL NUMBER")) or None
    tcsper = parse_number(first_value(row, ("TCSPER", "TCS %")))
    tcsamt = parse_number(first_value(row, ("TCSAMT", "TCS AMOUNT")))
    supplier_gstin = first_value(row, ("SUPPLIER GSTIN", "SUPPLIER GSTIN/UIN", "GSTIN", "GSTIN/UIN", "VENDOR GSTIN")) or None
    buyer_gstin = first_value(row, ("BUYER GSTIN", "CUSTOMER GSTIN", "RECIPIENT GSTIN")) or None
    supplier_address = first_value(row, ("SUPPLIER ADDRESS", "VENDOR ADDRESS", "ADDRESS")) or None
    supplier_state = first_value(row, ("SUPPLIER STATE", "VENDOR STATE")) or None
    supplier_state_code = first_value(row, ("SUPPLIER STATE CODE", "VENDOR STATE CODE", "STATE CODE")) or None
    buyer_address = first_value(row, ("BUYER ADDRESS", "CUSTOMER ADDRESS")) or None
    buyer_state = first_value(row, ("BUYER STATE", "CUSTOMER STATE")) or None
    buyer_state_code = first_value(row, ("BUYER STATE CODE", "CUSTOMER STATE CODE")) or None

    gst_rate = None
    if any(v is not None for v in (cgst_rate, sgst_rate, igst_rate)):
        gst_rate = round(sum(v or 0 for v in (cgst_rate, sgst_rate, igst_rate)), 2)
    gst_amount = None
    if any(v is not None for v in (cgst_amount, sgst_amount, igst_amount)):
        gst_amount = round(sum(v or 0 for v in (cgst_amount, sgst_amount, igst_amount)), 2)

    purchase_date_iso = parse_date(invoice_date)
    expiry_date_iso = parse_expiry_date(row)

    return {
        "source_row_key": source_row_key,
        "file_sha256": digest,
        "invoice_file": invoice_file,
        "row_number": row_number,
        "supplier_name": supplier or None,
        "invoice_no": invoice_no or None,
        "invoice_date": purchase_date_iso,
        "supplier_gstin": supplier_gstin,
        "supplier_address": supplier_address,
        "supplier_state": supplier_state,
        "supplier_state_code": supplier_state_code,
        "buyer_gstin": buyer_gstin,
        "buyer_address": buyer_address,
        "buyer_state": buyer_state,
        "buyer_state_code": buyer_state_code,
        "company": company or None,
        "item_code": item_code or None,
        "barcode": barcode or None,
        "item_name": item_name or None,
        "medicine_id": medicine_key(clean_medicine_name(item_name)) if item_name else None,
        "pack": pack or None,
        "batch_no": batch or None,
        "expiry": expiry,
        "expiry_date": expiry_date_iso,
        "qty": qty,
        "free_qty": free_qty,
        "half_pack": halfp,
        "purchase_rate": ftrate,
        "sale_rate": srate,
        "discount": discount,
        "mrp": mrp,
        "net_rate": parse_purchase_rate(row),
        "excise": excise,
        "vat": vat,
        "additional_vat": additional_vat,
        "line_amount": line_amount,
        "local_cent": local_cent,
        "scheme1": scm1,
        "scheme2": scm2,
        "scheme_percent": scmper,
        "customer_code": custcode,
        "invoice_day": invday,
        "invoice_month": invmonth,
        "invoice_year": invyear,
        "expiry_day": expday,
        "expiry_month": expmonth,
        "expiry_year": expyear,
        "supplier_code": suppcode,
        "invoice_amount": invoice_amount,
        "cgst_rate": cgst_rate,
        "sgst_rate": sgst_rate,
        "igst_rate": igst_rate,
        "gst_rate": gst_rate,
        "hsn_code": hsn_code,
        "cgst_amount": cgst_amount,
        "sgst_amount": sgst_amount,
        "igst_amount": igst_amount,
        "gst_amount": gst_amount,
        "expiry_display": expdt,
        "customer_order_no": custordno,
        "purchase_serial_no": psrlno,
        "tcs_percent": tcsper,
        "tcs_amount": tcsamt,
        "raw_row": {str(k): (None if v is None else str(v)) for k, v in raw_row.items() if k is not None},
    }


def upsert_purchase_lines(payloads: list[dict]) -> dict[str, dict]:
    """Upsert source invoice rows in batches and return source_row_key -> stored row."""
    if not payloads:
        return {}

    # A duplicate invoice file can produce the same source_row_key more than
    # once in metadata_rows. PostgreSQL ON CONFLICT DO UPDATE cannot process
    # duplicate conflict keys in the same INSERT statement.
    unique_payloads: dict[str, dict] = {}

    for payload in payloads:
        key = str(payload.get("source_row_key") or "").strip()

        if not key:
            raise RuntimeError(
                "Purchase invoice metadata row is missing source_row_key."
            )

        if key in unique_payloads:
            continue

        unique_payloads[key] = payload

    payloads = list(unique_payloads.values())

    result_by_key: dict[str, dict] = {}

    for start in range(0, len(payloads), 100):
        chunk = payloads[start:start + 100]
        result = supabase_request(
            "POST",
            "purchase_invoice_lines?on_conflict=source_row_key",
            chunk,
            "resolution=merge-duplicates,return=representation",
        )
        for item in result or []:
            key = item.get("source_row_key")
            if key:
                result_by_key[key] = item
    missing = [p["source_row_key"] for p in payloads if p["source_row_key"] not in result_by_key]
    if missing:
        raise RuntimeError(f"Purchase invoice metadata upsert did not return {len(missing)} row(s).")
    return result_by_key


def sync_purchase_invoice_metadata(source_row_keys: list[str]) -> int:
    """Attach previously captured purchase-line metadata to matching inventory batches.

    This is deliberately separate from stock application so re-scanning an invoice
    can backfill HSN/GST/pack/company/etc. without ever adding stock twice.
    """
    keys = [str(k) for k in source_row_keys if k]
    if not keys:
        return 0

    updated = 0
    for start in range(0, len(keys), 200):
        chunk = keys[start:start + 200]
        result = supabase_request(
            "POST",
            "rpc/sync_purchase_invoice_metadata",
            {"p_source_row_keys": chunk},
            "return=representation",
        )
        if isinstance(result, list):
            result = result[0] if result else {}
        if isinstance(result, dict):
            updated += int(result.get("updated_batches") or 0)
    return updated


def apply_invoice_purchase(
    name: str,
    quantity: int,
    batch_no: str,
    expiry: str | None,
    mrp: float,
    purchase_price: float | None,
    reference_id: str,
    source_key: str,
    source_metadata: dict | None = None,
):
    """Apply stock and atomically attach the captured purchase-invoice metadata to the batch."""
    if quantity <= 0:
        return {"status": "skipped", "reason": "non_positive_quantity"}
    if not batch_no:
        raise RuntimeError(f"Missing batch number for {name}")
    if not source_key:
        raise RuntimeError(f"Missing source key for {name}")

    result = supabase_request(
        "POST",
        "rpc/apply_invoice_purchase_with_metadata",
        {
            "p_medicine_id": medicine_key(name),
            "p_medicine_name": name,
            "p_batch_no": batch_no,
            "p_expiry": expiry or "",
            "p_mrp": mrp,
            "p_purchase_price": purchase_price,
            "p_quantity": quantity,
            "p_reference": reference_id,
            "p_source_key": source_key,
            "p_metadata": source_metadata or {},
        },
        "return=representation",
    )

    if isinstance(result, list):
        result = result[0] if result else None
    if not isinstance(result, dict):
        raise RuntimeError(f"Unexpected response for {name}: {result!r}")
    status = result.get("status")
    if status not in {"applied", "reconciled", "skipped"}:
        raise RuntimeError(f"Unexpected invoice purchase status for {name}: {result!r}")
    return result


# ── Load existing medicines ───────────────────────────────────────────────────
with open(MEDICINES_PATH, "r", encoding="utf-8") as f:
    js = f.read()

existing_names = re.findall(r'name:\s*"([^"]+)"', js)
existing_normalized = {normalize_for_dedup(x) for x in existing_names}

csv_files = [f for f in glob.glob("invoices/*") if f.lower().endswith(".csv")]
if not csv_files:
    print("No CSV files found in invoices/. Nothing to do.")
    raise SystemExit(0)

print(f"Found {len(csv_files)} invoice file(s).")

processed_invoices = load_processed_invoices()
new_by_cat: dict[str, list] = {}
metadata_rows: list[dict] = []
inventory_updates: list[dict] = []
newly_processed: dict[str, dict] = {}

for csv_path in sorted(csv_files):
    digest = file_sha256(csv_path)
    invoice_file = os.path.basename(csv_path)
    reference_id = f"{invoice_file}:{digest[:12]}"
    stock_already_processed = digest in processed_invoices

    if stock_already_processed:
        print(f"\nMetadata re-scan (stock already processed): {csv_path}")
    else:
        print(f"\nProcessing: {csv_path}")

    rows_seen = 0
    qty_seen = 0

    with open(csv_path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row_number, raw_row in enumerate(reader, start=2):
            if not raw_row or not any(str(v or "").strip() for v in raw_row.values()):
                continue

            row = normalise_row(raw_row)
            raw_name = first_value(row, ("ITEM NAME", "ITEM", "PRODUCT NAME", "MEDICINE NAME"))

            source_row_key = row_source_key(digest, row_number)
            source = invoice_source_payload(
                row,
                raw_row,
                invoice_file=invoice_file,
                digest=digest,
                row_number=row_number,
                source_row_key=source_row_key,
            )
            metadata_rows.append(source)
            rows_seen += 1

            mrp = parse_mrp(first_value(row, ("MRP", "MAX RETAIL PRICE")))
            if not raw_name:
                continue

            name = clean_medicine_name(raw_name)
            norm = normalize_for_dedup(name)

            # Catalog only gets a medicine when a trustworthy MRP is present.
            if mrp is not None:
                if norm not in existing_normalized:
                    cat = categorise(name)
                    new_by_cat.setdefault(cat, [])
                    if not any(normalize_for_dedup(i["name"]) == norm for i in new_by_cat[cat]):
                        new_by_cat[cat].append({"name": name, "mrp": mrp})
                        existing_normalized.add(norm)
                        print(f"  NEW [{cat}]: {name}  ₹{mrp}")
                else:
                    print(f"  CATALOG EXISTS: {name}")

            # Stock is never re-applied to an already processed file, but metadata is.
            if stock_already_processed:
                continue

            qty = parse_quantity(row)
            batch_no = parse_batch_no(row)
            expiry = parse_expiry(row)
            if qty > 0:
                if not batch_no:
                    raise RuntimeError(f"Invoice row for {name} has QTY {qty} but no Batch No.")
                if mrp is None:
                    print(f"  WARNING: stock not applied for {name} because MRP is missing/invalid")
                    continue
                inventory_updates.append({
                    "name": name,
                    "quantity": qty,
                    "batch_no": batch_no,
                    "expiry": expiry,
                    "mrp": mrp,
                    "purchase_price": parse_purchase_rate(row),
                    "reference_id": reference_id,
                    "invoice_digest": digest,
                    "source_row_key": source_row_key,
                })
                qty_seen += qty
            else:
                print(f"  WARNING: no usable quantity for {name}")

    if not stock_already_processed:
        newly_processed[digest] = {
            "file": invoice_file,
            "reference_id": reference_id,
            "rows": rows_seen,
            "units": qty_seen,
        }

# ── Insert new medicines into medicines.js ────────────────────────────────────
updated_js = js
total_added = 0

for cat_id, items in new_by_cat.items():
    pattern = rf'id:\s*"{re.escape(cat_id)}".*?items:\s*\['
    match = re.search(pattern, updated_js, re.DOTALL)
    if not match:
        print(f"  WARNING: '{cat_id}' not found → adding to general")
        pattern = r'id:\s*"general".*?items:\s*\['
        match = re.search(pattern, updated_js, re.DOTALL)
    if not match:
        print(f"  ERROR: no insertion point for {cat_id}")
        continue

    start = match.end()
    depth, pos = 1, start
    while pos < len(updated_js) and depth > 0:
        c = updated_js[pos]
        if c == "[":
            depth += 1
        elif c == "]":
            depth -= 1
        pos += 1

    insert_at = pos - 1
    lines = "\n".join(
        f'      {{ name: {json.dumps(i["name"])}, mrp: {i["mrp"]} }},'
        for i in items
    )
    block = f"\n      // ── invoice auto-added ──\n{lines}\n"
    updated_js = updated_js[:insert_at] + block + updated_js[insert_at:]
    total_added += len(items)
    print(f"  ✓ Added {len(items)} item(s) to '{cat_id}'")

if "export const CATALOG" not in updated_js:
    print("ERROR: CATALOG export missing — aborting before inventory update.")
    raise SystemExit(1)

if updated_js != js:
    with open(MEDICINES_PATH, "w", encoding="utf-8") as f:
        f.write(updated_js)

# ── Persist complete purchase-invoice metadata before inventory changes ────────
if metadata_rows:
    metadata_index = upsert_purchase_lines(metadata_rows)
    print(f"✓ Captured {len(metadata_index)} purchase invoice line(s) with full raw metadata")
    try:
        attached_before_stock = sync_purchase_invoice_metadata(list(metadata_index.keys()))
        print(f"✓ Backfilled metadata onto {attached_before_stock} existing inventory batch(es)")
    except Exception as exc:
        print(f"\nERROR: Could not backfill purchase metadata onto existing batches: {exc}")
        raise SystemExit(1)
else:
    metadata_index = {}

# ── Apply invoice quantities to Supabase ──────────────────────────────────────
aggregated: dict[tuple[str, str, str, str], dict] = {}
for item in inventory_updates:
    key = (
        medicine_key(item["name"]),
        item["batch_no"],
        item["expiry"] or "",
        item["reference_id"],
    )
    if key not in aggregated:
        aggregated[key] = dict(item)
    else:
        aggregated[key]["quantity"] += item["quantity"]

inventory_ok = True

if aggregated:
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        print("\nERROR: invoice quantities were found, but Supabase credentials are missing. Stock was NOT marked as processed.")
        inventory_ok = False
    else:
        try:
            for item in aggregated.values():
                source_key = "|".join([
                    item["reference_id"],
                    medicine_key(item["name"]),
                    item["batch_no"],
                    item["expiry"] or "",
                ])
                metadata = metadata_index.get(item.get("source_row_key")) or {}
                result = apply_invoice_purchase(
                    item["name"], item["quantity"], item["batch_no"], item["expiry"],
                    item["mrp"], item["purchase_price"], item["reference_id"], source_key,
                    metadata,
                )
                if result.get("status") == "skipped":
                    print(f"  SKIP stock already applied: {source_key}")
                else:
                    print(f"  ✓ STOCK + METADATA APPLIED: {item['name']} | {item['batch_no']} | +{item['quantity']}")
        except Exception as exc:
            inventory_ok = False
            print(f"\nERROR: Supabase inventory update failed: {exc}")
else:
    print("\nNo new invoice quantities to apply; purchase metadata was still captured.")

if inventory_ok:
    if metadata_index:
        try:
            attached_after_stock = sync_purchase_invoice_metadata(list(metadata_index.keys()))
            print(f"✓ Final metadata sync attached data to {attached_after_stock} batch(es)")
        except Exception as exc:
            print(f"\nERROR: Final purchase metadata sync failed: {exc}")
            raise SystemExit(1)
    processed_invoices.update(newly_processed)
    save_processed_invoices(processed_invoices)
else:
    raise SystemExit(1)

print(
    f"\n✅ Done — {total_added} new medicine(s) added to catalog; "
    f"{len(metadata_rows)} purchase invoice line(s) captured; "
    f"{len(aggregated)} inventory purchase update(s) applied."
)
