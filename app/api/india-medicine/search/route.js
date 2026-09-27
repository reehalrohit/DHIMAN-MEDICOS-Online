import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";

let medicineIndex = null;

function loadIndex() {
  if (medicineIndex) return medicineIndex;

  const file = path.join(
    process.cwd(),
    "public",
    "india-medicine-index.json"
  );

  medicineIndex = JSON.parse(fs.readFileSync(file, "utf8"));
  return medicineIndex;
}

function normalize(value) {
  return String(value || "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function scoreMedicine(item, query, normalizedQuery) {
  const name = normalize(item.n);
  let score = 0;

  if (name === normalizedQuery) score = 100;
  else if (name.startsWith(normalizedQuery)) score = 95;
  else if (name.includes(normalizedQuery)) score = 85;

  for (const generic of item.g || []) {
    const value = normalize(generic);

    if (value === normalizedQuery) score = Math.max(score, 80);
    else if (value.startsWith(normalizedQuery)) score = Math.max(score, 75);
    else if (value.includes(normalizedQuery)) score = Math.max(score, 65);
  }

  // Prefer shorter names when several results have the same match quality.
  if (score > 0) {
    score -= Math.min(item.n.length / 1000, 5);
  }

  return score;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const query = String(searchParams.get("q") || "").trim();

  if (query.length < 2) {
    return NextResponse.json({
      success: true,
      source: "CDCI",
      matches: [],
    });
  }

  const normalizedQuery = normalize(query);

  if (!normalizedQuery) {
    return NextResponse.json({
      success: true,
      source: "CDCI",
      matches: [],
    });
  }

  try {
    const index = loadIndex();

    const matches = [];

    for (const item of index) {
      const score = scoreMedicine(item, query, normalizedQuery);

      if (score > 0) {
        matches.push({
          name: item.n,
          generic: item.g?.[0] || "",
          score: Math.round(score * 10) / 10,
          source: "CDCI",
        });
      }
    }

    matches.sort((a, b) => b.score - a.score || a.name.length - b.name.length);

    return NextResponse.json(
      {
        success: true,
        source: "CDCI",
        matches: matches.slice(0, 8),
      },
      {
        headers: {
          "Cache-Control": "public, max-age=3600, s-maxage=3600",
        },
      }
    );
  } catch (error) {
    console.error("Indian medicine search error:", error);

    return NextResponse.json(
      {
        success: false,
        source: "CDCI",
        matches: [],
        error: "Indian medicine database unavailable.",
      },
      { status: 500 }
    );
  }
}
