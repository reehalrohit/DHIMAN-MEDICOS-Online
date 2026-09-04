"""
process-invoice.py  v4
──────────────────────
Reads invoice CSVs from invoices/
Categorises by comprehensive keyword + brand name matching (no AI needed)
Deduplicates, cleans names, inserts into lib/medicines.js
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


def parse_quantity(row) -> int:
    """
    Parse purchased QTY only.
    F.QTY/free scheme quantity is deliberately ignored.

    Rule:
      fractional part > 0.5  -> round up
      fractional part <= 0.5 -> round down

    Examples:
      0.50 -> 0
      0.51 -> 1
      0.75 -> 1
      1.33 -> 1
      1.50 -> 1
      1.67 -> 2
      2.50 -> 2
      2.51 -> 3
    """
    raw = row.get("QTY")

    if raw is None or str(raw).strip() == "":
        return 0

    try:
        value = float(str(raw).replace(",", "").strip())

        if value <= 0:
            return 0

        whole = int(value)
        fraction = value - whole

        if fraction > 0.5:
            return whole + 1

        return whole

    except (TypeError, ValueError):
        return 0



def first_value(row, names):
    """Return the first non-empty value from a list of possible CSV headings."""
    for name in names:
        value = row.get(name)
        if value is not None and str(value).strip():
            return str(value).strip()
    return ""


def parse_batch_no(row) -> str:
    return first_value(row, (
        "BATCH", "BATCH NO", "BATCH NO.", "BATCH NUMBER",
        "BATCHNO", "BATCH_NO", "B.NO", "B.NO."
    )).upper()


def parse_expiry(row) -> str | None:
    """
    Preserve the invoice expiry text. This avoids guessing a date when an
    exporter supplies MM/YY rather than a full date.
    """
    value = first_value(row, (
        "EXPIRY", "EXPIRY DATE", "EXP DATE", "EXP.DATE",
        "EXP", "EXP.", "EXPIRYDATE"
    ))
    return value or None


def file_sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


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
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured "
            "as GitHub Actions secrets/environment variables."
        )

    url = f"{SUPABASE_URL}/rest/v1/{path}"
    headers = {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
    }
    if prefer:
        headers["Prefer"] = prefer

    body = None if payload is None else json.dumps(payload).encode("utf-8")
    req = request.Request(url, data=body, headers=headers, method=method)

    try:
        with request.urlopen(req, timeout=30) as response:
            raw = response.read().decode("utf-8")
            return json.loads(raw) if raw else None
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(
            f"Supabase request failed ({exc.code}) {method} {path}: {detail}"
        ) from exc


def get_inventory_record(medicine_id: str):
    encoded = request.quote(medicine_id, safe="")
    rows = supabase_request(
        "GET",
        f"inventory?medicine_id=eq.{encoded}&select=medicine_id,medicine_name,quantity,low_stock_at,status&limit=1"
    )
    return rows[0] if rows else None


def stock_status(quantity: int, low_stock_at: int = 5) -> str:
    if quantity <= 0:
        return "Out of Stock"
    if quantity <= low_stock_at:
        return "Low Stock"
    return "In Stock"



def add_purchase_batch(
    name: str,
    quantity: int,
    batch_no: str,
    expiry: str | None,
    mrp: float,
    purchase_price: float | None,
    reference_id: str,
):
    """
    Add stock to a specific medicine batch. The database table must enforce
    UNIQUE(medicine_id, batch_no, expiry) so repeated purchases of the same
    physical batch accumulate rather than creating duplicate rows.
    """
    if quantity <= 0:
        return
    if not batch_no:
        raise RuntimeError(f"Missing batch number for {name}")

    medicine_id = medicine_key(name)
    encoded_id = request.quote(medicine_id, safe="")
    encoded_batch = request.quote(batch_no, safe="")
    expiry_filter = (
        f"expiry=eq.{request.quote(expiry, safe='')}"
        if expiry
        else "expiry=is.null"
    )

    rows = supabase_request(
        "GET",
        "inventory_batches?"
        f"medicine_id=eq.{encoded_id}&"
        f"batch_no=eq.{encoded_batch}&"
        f"{expiry_filter}&"
        "select=id,quantity&limit=1",
    )

    if rows:
        batch_id = rows[0]["id"]
        old_qty = int(rows[0].get("quantity") or 0)
        new_qty = old_qty + quantity
        supabase_request(
            "PATCH",
            f"inventory_batches?id=eq.{request.quote(str(batch_id), safe='')}",
            {
    "quantity": new_qty,
    "mrp": mrp,
    "purchase_price": purchase_price,
    "medicine_name": name,
    "reference_id": reference_id,
},
            "return=minimal",
        )
    else:
        old_qty = 0
        new_qty = quantity
        supabase_request(
            "POST",
            "inventory_batches",
            {
    "medicine_id": medicine_id,
    "medicine_name": name,
    "batch_no": batch_no,
    "expiry": expiry,
    "mrp": mrp,
    "purchase_price": purchase_price,
    "quantity": quantity,
    "reference_id": reference_id,
},
            "return=minimal",
        )

    print(
        f"  BATCH: {name} | {batch_no} | expiry {expiry or 'N/A'} | "
        f"{old_qty} + {quantity} = {new_qty}"
    )


def add_purchase_to_inventory(name: str, quantity: int, reference_id: str):
    """
    Add purchased units to the current inventory quantity.
    Also records a purchase movement when stock_movements exists.
    """
    if quantity <= 0:
        return

    medicine_id = medicine_key(name)
    current = get_inventory_record(medicine_id)

    if current:
        old_qty = int(current.get("quantity") or 0)
        low_stock_at = int(current.get("low_stock_at") or 5)
        new_qty = old_qty + quantity

        encoded = request.quote(medicine_id, safe="")
        supabase_request(
            "PATCH",
            f"inventory?medicine_id=eq.{encoded}",
            {
                "medicine_name": name,
                "quantity": new_qty,
                "low_stock_at": low_stock_at,
                "status": stock_status(new_qty, low_stock_at),
            },
            "return=minimal",
        )
    else:
        old_qty = 0
        new_qty = quantity
        low_stock_at = 5
        supabase_request(
            "POST",
            "inventory",
            {
                "medicine_id": medicine_id,
                "medicine_name": name,
                "quantity": new_qty,
                "low_stock_at": low_stock_at,
                "status": stock_status(new_qty, low_stock_at),
            },
            "return=minimal",
        )

    # Stock movement is useful for audit history. If the table is not present,
    # don't undo a successful inventory update.
    try:
        supabase_request(
            "POST",
            "stock_movements",
            {
                "medicine_id": medicine_id,
                "medicine_name": name,
                "type": "purchase",
                "quantity": quantity,
                "reference_id": reference_id,
                "note": f"Auto-added from invoice {reference_id}",
            },
            "return=minimal",
        )
    except RuntimeError as exc:
        print(f"  WARNING: inventory updated but movement log failed: {exc}")

    print(f"  STOCK: {name}: {old_qty} + {quantity} = {new_qty}")


# ── Load existing medicines ───────────────────────────────────────────────────
with open(MEDICINES_PATH, "r", encoding="utf-8") as f:
    js = f.read()

existing_names = re.findall(r'name:\s*"([^"]+)"', js)
existing_normalized = {normalize_for_dedup(x) for x in existing_names}

# ── Read CSVs ─────────────────────────────────────────────────────────────────
csv_files = [f for f in glob.glob("invoices/*") if f.lower().endswith(".csv")]
if not csv_files:
    print("No CSV files found in invoices/. Nothing to do.")
    raise SystemExit(0)

print(f"Found {len(csv_files)} invoice file(s).")

processed_invoices = load_processed_invoices()
new_by_cat: dict[str, list] = {}
inventory_updates: list[dict] = []
newly_processed: dict[str, dict] = {}

for csv_path in sorted(csv_files):
    digest = file_sha256(csv_path)
    reference_id = f"{os.path.basename(csv_path)}:{digest[:12]}"

    # Content hash prevents the same invoice file from adding stock twice,
    # even when the workflow is manually rerun.
    if digest in processed_invoices:
        print(f"\nSKIP invoice already processed for stock: {csv_path}")
        continue

    print(f"\nProcessing: {csv_path}")
    rows_seen = 0
    qty_seen = 0

    with open(csv_path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            raw_name = (row.get("ITEM NAME") or "").strip()
            mrp = parse_mrp(row.get("MRP"))
            purchase_price = parse_purchase_rate(row)
            if not raw_name or mrp is None:
                continue
            if raw_name.upper() in ("FREE GIFT", "FREE", "N/A"):
                continue

            rows_seen += 1
            name = clean_medicine_name(raw_name)
            norm = normalize_for_dedup(name)

            # CATALOG: only add medicines that do not already exist.
            if norm not in existing_normalized:
                cat = categorise(name)
                new_by_cat.setdefault(cat, [])
                if not any(normalize_for_dedup(i["name"]) == norm for i in new_by_cat[cat]):
                    new_by_cat[cat].append({"name": name, "mrp": mrp})
                    existing_normalized.add(norm)
                    print(f"  NEW [{cat}]: {name}  ₹{mrp}")
            else:
                print(f"  CATALOG EXISTS: {name}")

            # INVENTORY: every invoice line is eligible, including existing meds.
            qty = parse_quantity(row)
            batch_no = parse_batch_no(row)
            expiry = parse_expiry(row)

            if qty > 0:
                if not batch_no:
                    raise RuntimeError(
                        f"Invoice row for {name} has QTY {qty} but no Batch No."
                    )

                inventory_updates.append({
    "name": name,
    "quantity": qty,
    "batch_no": batch_no,
    "expiry": expiry,
    "mrp": mrp,
    "purchase_price": purchase_price,
    "reference_id": reference_id,
    "invoice_digest": digest,
})
                qty_seen += qty
            else:
                print(f"  WARNING: no usable quantity for {name}")

    newly_processed[digest] = {
        "file": os.path.basename(csv_path),
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

# ── Apply invoice quantities to Supabase ──────────────────────────────────────
# Aggregate duplicate medicine rows inside the same invoice/reference before
# touching Supabase.
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
        print(
            "\nERROR: invoice quantities were found, but Supabase credentials "
            "are missing. Stock was NOT marked as processed."
        )
        inventory_ok = False
    else:
        try:
            for item in aggregated.values():
                # 1) Batch-level stock for POS/billing.
                add_purchase_batch(
                    item["name"],
                    item["quantity"],
                    item["batch_no"],
                    item["expiry"],
                    item["mrp"],
                    item["purchase_price"],
                    item["reference_id"],
                )

                # 2) Aggregate medicine-level stock for storefront availability.
                add_purchase_to_inventory(
                    item["name"],
                    item["quantity"],
                    item["reference_id"],
                )
        except Exception as exc:
            inventory_ok = False
            print(f"\nERROR: Supabase inventory update failed: {exc}")
else:
    print("\nNo positive invoice quantities found; no Supabase stock changes required.")

# Only mark invoices processed after every intended inventory update succeeds.
if inventory_ok:
    processed_invoices.update(newly_processed)
    save_processed_invoices(processed_invoices)
else:
    raise SystemExit(1)

print(
    f"\n✅ Done — {total_added} new medicine(s) added to catalog; "
    f"{len(aggregated)} inventory purchase update(s) applied."
)
