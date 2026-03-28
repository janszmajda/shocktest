import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const K2_URL = "https://api.k2think.ai/v1/chat/completions";
const K2_MODEL = "MBZUAI-IFM/K2-Think-v2";

async function callK2(prompt: string): Promise<string> {
  const apiKey = process.env.K2_API_KEY;
  if (!apiKey) throw new Error("K2_API_KEY not set");

  console.log(`[K2 shock-advisor prompt]\n${prompt}`);

  const res = await fetch(K2_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: K2_MODEL,
      messages: [{ role: "user", content: prompt }],
      stream: false,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`K2 API error ${res.status}: ${err}`);
  }

  const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
  let content = data.choices[0].message.content;
  const thinkEnd = content.indexOf("</think>");
  if (thinkEnd !== -1) content = content.slice(thinkEnd + 8).trim();
  return content;
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as {
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
      category_win_rate: number | null;
    };

    const direction = body.delta > 0 ? "spike up" : "drop";
    const pp = Math.abs(body.delta * 100).toFixed(1);
    const before = (body.p_before * 100).toFixed(0);
    const after = (body.p_after * 100).toFixed(0);
    const reversionSummary = [
      body.reversion_1h != null ? `1h: ${(body.reversion_1h * 100).toFixed(1)}pp` : null,
      body.reversion_6h != null ? `6h: ${(body.reversion_6h * 100).toFixed(1)}pp` : null,
      body.reversion_24h != null ? `24h: ${(body.reversion_24h * 100).toFixed(1)}pp` : null,
    ]
      .filter(Boolean)
      .join(", ") || "no post-shock data yet";

    const prompt = `You are a prediction market advisor. Write a single concise paragraph (4-6 sentences) analyzing this shock. Cover: what likely caused the move, whether it looks like an overreaction or rational repricing, the base case for reversion, and a direct trade recommendation. Be specific — use the numbers given. No headers, no bullet points, just the paragraph.

Market: "${body.question}"
Shock: ${before}% → ${after}% (${pp}pp ${direction}) | Category: ${body.category ?? "uncategorized"} | Historical fade win rate: ${body.category_win_rate != null ? `${(body.category_win_rate * 100).toFixed(1)}%` : "unknown"} | Post-shock reversion: ${reversionSummary}`;

    const analysis = await callK2(prompt);
    return NextResponse.json({ analysis });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
