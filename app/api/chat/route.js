export async function POST(req) {
  try {
    const { message } = await req.json();

    if (!message?.trim()) {
      return Response.json({
        reply: "Please enter a question."
      });
    }

    if (!process.env.OPENROUTER_API_KEY) {
      return Response.json({
        reply: "AI service is not configured."
      });
    }

    const MODELS = [
      "openai/gpt-oss-20b:free",
      "google/gemma-3-27b-it:free",
      "mistralai/mistral-small-3.2-24b-instruct:free",
      "meta-llama/llama-3.3-70b-instruct:free",
      "qwen/qwen3-32b:free"
    ];

    const SYSTEM_PROMPT = `
You are Dhiman Medicos AI Assistant.

You work for a pharmacy.

Rules:

- Answer medicine and health related questions.
- Keep answers short and practical.
- If a user enters a medicine name, assume it is a medicine.
- Never interpret medicine names as cities, places, people, or unrelated topics.
- If stock availability is asked, say:
  "Please check the product listing or contact Dhiman Medicos directly for current stock."
- Do not diagnose diseases.
- Do not prescribe treatment.
- Give only general health information.
- If unsure, ask a brief follow-up question.
`;

    let userPrompt = message.trim();

    const medicineHints = [
      "solvin",
      "tusston",
      "cheston",
      "sneecure",
      "nasopil",
      "vicks",
      "zerodol"
    ];

    const isMedicine =
      medicineHints.some(m =>
        userPrompt.toLowerCase().includes(m)
      );

    if (isMedicine) {
      userPrompt = `
The following user input contains a medicine name.

Treat it as a medicine sold by Dhiman Medicos.

User Query:
${message}
`;
    }

    let lastError = "Unknown error";

    for (const model of MODELS) {
      try {
        const controller = new AbortController();

        const timeout = setTimeout(() => {
          controller.abort();
        }, 20000);

        const response = await fetch(
          "https://openrouter.ai/api/v1/chat/completions",
          {
            method: "POST",
            signal: controller.signal,
            headers: {
              Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
              "Content-Type": "application/json",
              "HTTP-Referer": "https://dhiman-medicos.vercel.app",
              "X-Title": "Dhiman Medicos AI"
            },
            body: JSON.stringify({
              model,
              temperature: 0.3,
              max_tokens: 500,
              messages: [
                {
                  role: "system",
                  content: SYSTEM_PROMPT
                },
                {
                  role: "user",
                  content: userPrompt
                }
              ]
            })
          }
        );

        clearTimeout(timeout);

        const data = await response.json();

        if (
          response.ok &&
          data?.choices?.[0]?.message?.content
        ) {
          return Response.json({
            reply: data.choices[0].message.content.trim(),
            model
          });
        }

        lastError =
          data?.error?.message ||
          `Model failed: ${model}`;
      } catch (err) {
        lastError =
          err?.message ||
          `Error with model ${model}`;
      }
    }

    return Response.json({
      reply:
        "Sorry, AI service is temporarily unavailable. Please try again later.",
      error: lastError
    });
  } catch (error) {
    return Response.json({
      reply: "Server error. Please try again.",
      error: error?.message
    });
  }
}
