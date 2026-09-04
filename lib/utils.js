import { WA_NUMBER, allMeds } from "./medicines";

export function waLink(name, mrp) {
  return `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(
    `Hi Dhiman Medicos,

I want to order:

Medicine: ${name}
MRP: ₹${mrp}
Quantity: 1

Please confirm availability.`
  )}`;
}

export function getReply(q) {
  const txt = q.toLowerCase().trim();

  // Fever / Temperature
  if (txt.includes("fever") || txt.includes("bukhar") || txt.includes("temperature")) {
    return `🌡️ **Fever Management:**
    
For fever relief, we have:
• **Dolo 650mg** - Fast acting, safe
• **Calpol** - Gentle, trusted brand
• **Crocin** - Effective pain relief
    
💡 Tip: Stay hydrated, rest well. If fever persists beyond 3 days, consult a doctor.
    
📞 Tap to order via WhatsApp!`;
  }

  // Blood Pressure
  if (txt.includes("bp") || txt.includes("blood pressure") || txt.includes("hypertension")) {
    return `❤️ **Blood Pressure Management:**
    
We stock effective BP medicines:
• **Telma 40** - Popular, well-tolerated
• **Telmikind** - Affordable option
• **Concor** - For heart + BP
    
⚠️ Important: Check BP regularly, maintain a healthy diet & reduce salt intake.
    
👨‍⚕️ Consult your doctor for proper dosage.`;
  }

  // Diabetes
  if (txt.includes("diabetes") || txt.includes("sugar") || txt.includes("glucose")) {
    return `🩺 **Diabetes Care:**
    
Medicines available:
• **Glimda** - For type 2 diabetes
• **Glymat** - Reliable blood sugar control
• **Dapagain** - Modern diabetes management
    
💪 Tips:
- Monitor blood sugar levels regularly
- Follow a balanced diet
- Regular exercise helps
    
📋 Get your medicines on WhatsApp!`;
  }

  // Cough & Cold
  if (txt.includes("cough") || txt.includes("khansi") || txt.includes("cold")) {
    return `🤧 **Cough & Cold Relief:**
    
We have multiple options:
• **Rexcof DX** - For dry cough
• **Tusston Super** - Effective cough syrup
• **Solvin** - For productive cough
    
✨ Get better faster:
- Drink warm liquids
- Use honey for soothing
- Rest well
    
🏥 Persistent cough? Consult a doctor.`;
  }

  // Pain Relief
  if (txt.includes("pain") || txt.includes("dard") || txt.includes("ache")) {
    return `💊 **Pain Relief Solutions:**
    
Available options:
• **Zerodol P** - Strong, effective
• **Combiflam** - For various pain types
• **Dolo 650mg** - General purpose
    
📌 Uses: Headache, body ache, muscle pain
    
⚕️ Use only as needed. Don't exceed recommended dose.
    
Order now via WhatsApp! 🛒`;
  }

  // Acidity & Stomach
  if (txt.includes("acidity") || txt.includes("gas") || txt.includes("heartburn") || txt.includes("stomach")) {
    return `🏥 **Acidity & Digestion:**
    
Relief medications available:
• **Pantosec 40mg** - Trusted, effective
• **Pan D** - For acid reflux
• **Digene** - Quick relief
    
🍽️ Prevention tips:
- Eat slowly, small portions
- Avoid spicy, oily foods
- Don't skip meals
    
💬 WhatsApp us to order!`;
  }

  // Thyroid
  if (txt.includes("thyroid") || txt.includes("thyronorm")) {
    return `⚖️ **Thyroid Management:**
    
We stock:
• **Thyronorm** - Standard treatment
• Alternative brands available
    
📍 Key Points:
- Take on empty stomach
- Consistent timing daily
- Regular TSH monitoring needed
    
👨‍⚕️ Always follow doctor's prescription.
    
📞 Order with WhatsApp!`;
  }

  // Allergies
  if (txt.includes("allergy") || txt.includes("allergic") || txt.includes("itching")) {
    return `🧴 **Allergy & Itch Relief:**
    
Treatment options:
• Antihistamines
• Topical creams
• Oral medications
    
💡 Relief measures:
- Avoid allergen triggers
- Keep skin clean & moisturized
- Wear comfortable clothes
    
🔍 Unsure about allergy type? Consult doctor.
    
📲 Message us for availability!`;
  }

  // Vitamins & Supplements
  if (txt.includes("vitamin") || txt.includes("supplement") || txt.includes("tonic")) {
    return `💪 **Vitamins & Supplements:**
    
Popular choices:
• Vitamin B Complex
• Vitamin C
• Calcium supplements
• Multivitamins
    
✨ Benefits:
- Boosts immunity
- Better energy levels
- Stronger bones
    
🥗 Also maintain healthy diet & exercise.
    
Order at best prices! 🛍️`;
  }

  // Generic medicine search
  if (txt.includes("medicine") || txt.includes("tablet") || txt.includes("syrup")) {
    const matchedMeds = allMeds
      .filter((m) => m.name.toLowerCase().includes(txt.replace(/[^\w\s]/g, "")))
      .slice(0, 3);

    if (matchedMeds.length > 0) {
      const medsText = matchedMeds
        .map((m) => `• **${m.name}** - ₹${m.mrp}`)
        .join("\n");

      return `🔍 **Medicines Found:**
    
${medsText}
    
📞 Click to order via WhatsApp or search for another medicine!`;
    }
  }

  // Default helpful response
  return `💬 **How can we help?**
    
Ask about:
• 🌡️ Fever & Cold
• ❤️ Blood Pressure & Heart
• 🩺 Diabetes
• 💊 Pain Relief
• 🏥 Stomach & Digestion
• 🧴 Allergies
• 💪 Vitamins & Supplements
    
Or search for any medicine by name!
    
📲 Don't see what you need? WhatsApp us directly! We stock 430+ medicines.`;
}

// Helper function to find medicines by symptom
export function findMedicinesBySymptom(symptom) {
  const symptomMap = {
    fever: ["DOLO", "CALPOL", "CROCIN"],
    cough: ["REXCOF", "TUSSTON", "SOLVIN"],
    bp: ["TELMA", "CONCOR", "TELMIKIND"],
    diabetes: ["GLIMDA", "GLYMAT", "DAPAGAIN"],
    pain: ["ZERODOL", "COMBIFLAM", "DOLO"],
    acidity: ["PANTOSEC", "PAN D"],
  };

  const keywords = symptomMap[symptom.toLowerCase()] || [];
  return allMeds.filter((med) =>
    keywords.some((keyword) => med.name.includes(keyword))
  );
}
