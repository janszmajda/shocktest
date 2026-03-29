import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const CLAUDE_URL = "https://api.anthropic.com/v1/messages";

async function callClaudeWithSearch(prompt: string): Promise<string> {
  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) throw new Error("CLAUDE_API_KEY not set");

  console.log(`[Claude shock-advisor prompt]\n${prompt}`);

  const res = await fetch(CLAUDE_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }],
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API error ${res.status}: ${err}`);
  }

  const data = (await res.json()) as {
    content: Array<{ type: string; text?: string; source?: { url: string; title: string } }>;
  };

  // Extract text blocks and source citations
  const textParts: string[] = [];
  const sources: string[] = [];

  for (const block of data.content) {
    if (block.type === "text" && block.text) {
      textParts.push(block.text);
    }
    if (block.type === "web_search_tool_result") {
      // Search results are inline — Claude weaves them into the response
    }
  }

  const text = textParts.join("").replace(/<\/?cite[^>]*>/g, "").trim();
  if (sources.length > 0) {
    return `${text}\n\nSources:\n${sources.join("\n")}`;
  }
  return text;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      question: string;
      category: string | null;
      p_before: number;
      p_after: number;
      delta: number;
      t2: string;
      source: string;
      reversion_1h: number | null;
      reversion_6h: number | null;
      reversion_24h: number | null;
      current_price: number | null;
      category_win_rate: number | null;
    };

    const direction = body.delta > 0 ? "spike up" : "drop";
    const pp = Math.abs(body.delta * 100).toFixed(1);
    const before = (body.p_before * 100).toFixed(0);
    const after = (body.p_after * 100).toFixed(0);
    const reversionSummary =
      [
        body.reversion_1h != null
          ? `1h: ${(body.reversion_1h * 100).toFixed(1)}pp`
          : null,
        body.reversion_6h != null
          ? `6h: ${(body.reversion_6h * 100).toFixed(1)}pp`
          : null,
        body.reversion_24h != null
          ? `24h: ${(body.reversion_24h * 100).toFixed(1)}pp`
          : null,
      ]
        .filter(Boolean)
        .join(", ") || "no post-shock data yet";

    const shockDate = new Date(body.t2);
    const shockTime = shockDate.toLocaleString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    });

    const isSports = body.category === "sports";

    const searchGuidance = isSports
      ? `This is a live sports/esports market. Search for the game score, specific scoring events (goals, touchdowns, baskets, rounds won), lineup changes, or injuries around ${shockTime} that caused the odds to shift. Look for live game updates, box scores, or play-by-play.`
      : `Search the web for news around ${shockTime} that explains this prediction market price movement. Focus on events from that specific date and time.`;

    const hoursAgo = (Date.now() - shockDate.getTime()) / 3600000;
    const current = body.current_price != null ? (body.current_price * 100).toFixed(0) : null;
    const currentNum = body.current_price != null ? body.current_price * 100 : null;
    const likelyResolved = currentNum != null && (currentNum <= 2 || currentNum >= 98);

    let currentLine = "";
    if (current) {
      const timeSince = hoursAgo < 1 ? `${Math.round(hoursAgo * 60)}min` : `${hoursAgo.toFixed(1)}h`;
      if (likelyResolved) {
        currentLine = `\nCurrent price: ${current}% (${timeSince} after shock — market has likely RESOLVED at ${currentNum! >= 98 ? "YES" : "NO"}. Do NOT recommend a trade on a resolved market. Focus on explaining what happened.)`;
      } else {
        currentLine = `\nCurrent price: ${current}% (${timeSince} after shock${current !== after ? ` — moved from ${after}% to ${current}%` : ""})`;
      }
    }

    const prompt = `${searchGuidance}

Market: "${body.question}"
Source: ${body.source} (Polymarket)
Shock time: ${shockTime}
Shock: ${before}% → ${after}% (${pp}pp ${direction})${currentLine}
Category: ${body.category ?? "uncategorized"}
Historical fade win rate: ${body.category_win_rate != null ? `${(body.category_win_rate * 100).toFixed(1)}%` : "unknown"}
Post-shock reversion: ${reversionSummary}

Respond in EXACTLY this JSON format, no other text:
{"event":"One sentence: the specific ${isSports ? "in-game event (score, play, injury)" : "real-world event or news"} that caused the ${pp}pp ${direction}.","decision":"One sentence: the recommended trade action and why, using the historical fade win rate.","details":"2-3 sentences of deeper context: ${isSports ? "current game state, momentum factors, how often markets overreact to this type of play" : "broader context behind the news, how the market has historically reacted to similar events"}, and the key risk to watch."}`;

    const raw = await callClaudeWithSearch(prompt);

    // Extract JSON from response (Claude may wrap it in markdown code blocks)
    let parsed: { event: string; decision: string; details: string };
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
    } catch {
      // Fallback if JSON parse fails
      parsed = { event: raw, decision: "", details: "" };
    }

    return NextResponse.json({ analysis: parsed });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
