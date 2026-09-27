import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const RXNORM_BASE = "https://rxnav.nlm.nih.gov/REST";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const query = String(searchParams.get("q") || "").trim();

  if (query.length < 3) {
    return NextResponse.json({
      success: true,
      matches: [],
    });
  }

  try {
    const url = new URL(`${RXNORM_BASE}/approximateTerm.json`);

    url.searchParams.set("term", query);
    url.searchParams.set("maxEntries", "6");
    url.searchParams.set("option", "1");

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
      next: {
        revalidate: 3600,
      },
    });

    if (!response.ok) {
      throw new Error(`RxNorm returned HTTP ${response.status}`);
    }

    const data = await response.json();

    const candidates =
      data?.approximateGroup?.candidate || [];

    const seen = new Set();

    const matches = candidates
      .map((item) => ({
        rxcui: String(item?.rxcui || ""),
        name: String(item?.name || "").trim(),
        score: Number(item?.score || 0),
        rank: Number(item?.rank || 0),
        source: String(item?.source || "RXNORM"),
      }))
      .filter((item) => {
        if (
          !item.rxcui ||
          !item.name ||
          seen.has(item.rxcui)
        ) {
          return false;
        }

        seen.add(item.rxcui);
        return true;
      })
      .slice(0, 5);

    return NextResponse.json(
      {
        success: true,
        matches,
      },
      {
        headers: {
          "Cache-Control":
            "public, max-age=3600, s-maxage=3600",
        },
      }
    );
  } catch (error) {
    console.error("RxNorm search error:", error);

    return NextResponse.json(
      {
        success: false,
        matches: [],
        error: "RxNorm lookup unavailable.",
      },
      { status: 502 }
    );
  }
      }
