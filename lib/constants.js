// Symptom/Hindi synonyms a user might type, mapped to the medicine
// brand-name keywords that should surface for that symptom.
// FIX: previously SEARCH_ALIASES only listed synonym words with no
// link back to actual medicine names, which caused typing "fever"
// (a literal alias word) to match every medicine in the catalog.
export const SEARCH_ALIASES = {
  fever: {
    words: ["fever", "bukhar", "temperature"],
    brands: ["DOLO", "CALPOL", "CROCIN", "PARACIP", "PACIMOL", "PARAFAST"],
  },
  cough: {
    words: ["cough", "khansi", "cold"],
    brands: ["REXCOF", "TUSSTON", "SOLVIN", "AMBROX", "ASCORIL", "BENADRYL"],
  },
  bp: {
    words: ["bp", "blood pressure", "hypertension"],
    brands: ["TELMA", "CONCOR", "TELMIKIND", "AMLOKIND", "CARDACE", "STAMLO"],
  },
  diabetes: {
    words: ["diabetes", "sugar", "glucose"],
    brands: ["GLIMDA", "GLYMAT", "DAPAGAIN", "GLYCOMET", "JANUVIA", "PIOZ"],
  },
  pain: {
    words: ["pain", "dard"],
    brands: ["ZERODOL", "COMBIFLAM", "DOLO", "BRUFEN", "NIMULID", "FLEXON"],
  },
  acidity: {
    words: ["acidity", "gas", "heartburn"],
    brands: ["PANTOSEC", "PAN D", "OMEE", "RANTAC", "GELUSIL", "DIGENE"],
  },
  thyroid: {
    words: ["thyroid"],
    brands: ["THYRONORM", "THYROX", "ELTROXIN"],
  },
};

export const QUICK_ASKS = [
  { label: "🌡️ Fever", q: "fever medicine" },
  { label: "🤧 Cold", q: "cold cough" },
  { label: "❤️ BP", q: "blood pressure" },
  { label: "🩺 Diabetes", q: "diabetes" },
  { label: "💊 Pain", q: "pain relief" },
  { label: "🏥 Acidity", q: "acidity" },
];

export const SUGGESTED_MEDICINES = ["Dolo", "Calpol", "Azicip", "Thyronorm"];
