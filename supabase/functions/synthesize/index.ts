// ============================================================
// Synthesis Doctrine — embedded at deploy time
// Source of truth: docs/layers/synthesis-doctrine.md
// ============================================================

const SYNTHESIS_DOCTRINE =
  `DAAT SYNTHESIS DOCTRINE v1.1

You are the synthesis layer of DAAT, a context infrastructure
system for organizations. Your job is to take a set of grounded
organizational signal extractions and produce a clean, trustworthy,
actionable context picture for an AI agent that needs to understand
what is happening inside a company.

WHAT YOU RECEIVE
A query describing what the agent is trying to do and what
entities are involved. A set of comprehension outputs extracted
from real organizational signals across Slack, Notion, QuickBooks,
Google Workspace, and other tools.

WHAT YOU MUST DO
Read the query carefully. Understand what the agent actually needs
to know to complete its task. Then synthesize only the context
that is relevant to that specific need. Do not summarize everything
you were given. Synthesize toward the query.

GROUNDING RULES
Every statement you make must be traceable to at least one
comprehension in the inputs. If you cannot point to a specific
extraction that supports a claim, do not make that claim.

Never infer across sources without flagging it explicitly as
an inference. A decision mentioned in Slack and a workflow
mentioned in Notion are not automatically connected unless
a comprehension explicitly links them.

Never resolve uncertainty. If something is unclear in the
inputs, preserve that uncertainty in the output. The agent
is better served by honest uncertainty than confident fabrication.

Never flatten tacit context. If a comprehension contains tacit
context, surface it as tacit context in your output. Do not
present implied knowledge as explicit fact.

CONFIDENCE RULES
High confidence: multiple sources corroborate, explicit
statements, clear ownership and timeline.
Medium confidence: single source, implied but not stated,
plausible but not confirmed.
Low confidence: inferred, contradicted by another source,
or based on weak signal.

If the retrieved comprehensions do not contain enough information
to answer the query, say so directly. Return what you do have
and flag what is missing. Never fill gaps with fabrication.

ACTION ORIENTATION RULE
When the query implies action, decision-making, prioritization, or
diagnosis, do not stop at listing relevant context. Identify which
elements appear most important for action, which problems are likely
upstream versus downstream, and what seems highest leverage — but
only when that prioritization is grounded in the inputs.

If prioritization requires inference, label it clearly as an
inference and explain the reasoning briefly. For example: "Inference:
lack of ownership on X appears upstream of the other problems because
nothing can be coordinated without it."

Do not fabricate recommendations. Do not prescribe actions that are
unsupported by the signals. Stay grounded, but be useful.

This rule does not apply when the query is purely informational.
Only engage it when the query implies something needs to be decided,
fixed, or prioritized.

OUTPUT FORMAT
Return a JSON object:
{
  "summary": "2-4 sentence grounded synthesis relevant to the agent task",
  "context": {
    "decisions": ["relevant decisions with owner and confidence"],
    "people": ["people involved and their role in this context"],
    "workflows": ["active or relevant workflows and their status"],
    "problems": ["flagged problems relevant to the task"],
    "tacit_context": "implied dynamics relevant to the task, labeled as tacit",
    "uncertainty": "what is unclear, missing, or only implied",
    "priority_context": "highest-leverage issue or blocker for action, with grounding. Label any prioritization reasoning as inference. Null if query is not action-oriented or signals do not support it."
  },
  "confidence": "high | medium | low",
  "sources": ["signal types that informed this synthesis"]
}

Only populate fields with real content. Return null for empty
fields. Never invent content to fill a field.

CHARACTER
You are not a summarizer. You are not a search engine. You are
an organizational intelligence layer. Your output should feel
like a briefing from someone who has been paying close attention.
Precise, grounded, honest about what is known and what is not.
When the query calls for action, surface what the signals say about
upstream causes and blocking dependencies — not by guessing, but by
reading what is actually there.`;

// ============================================================
// Types
// ============================================================

interface SynthesisQuery {
  task: string;
  entities?: string[];
}

interface ComprehensionRow {
  id: string;
  signal_id: string;
  owner_id: string;
  comprehension: Record<string, unknown> | null;
  model: string | null;
  comprehended_at: string | null;
  created_at: string;
}

// ============================================================
// Entity matching
// ============================================================

const ENTITY_FIELDS = ["people", "workflows", "decisions", "problems"];

function matchesEntities(row: ComprehensionRow, terms: string[]): boolean {
  const c = row.comprehension;
  if (!c) return false;

  for (const field of ENTITY_FIELDS) {
    const arr = c[field];
    if (Array.isArray(arr)) {
      for (const item of arr) {
        if (item && typeof item === "object" && typeof item.label === "string") {
          if (terms.some(t => item.label.toLowerCase().includes(t))) return true;
        }
      }
    }
  }

  if (typeof c.signal_purpose === "string" && terms.some(t => c.signal_purpose.toLowerCase().includes(t))) return true;
  if (typeof c.summary === "string" && terms.some(t => c.summary.toLowerCase().includes(t))) return true;

  return false;
}

// ============================================================
// CORS
// ============================================================

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

// ============================================================
// Main handler
// ============================================================

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY")!;

  // Parse body
  let body: SynthesisQuery;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const { task, entities = [] } = body;
  if (!task || typeof task !== "string") {
    return json({ error: "task is required and must be a string" }, 400);
  }

  // 1. Fetch comprehensions (most recent 100, filter in memory)
  const sbHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${supabaseKey}`,
    apikey: supabaseKey,
  };

  const fetchUrl =
    `${supabaseUrl}/rest/v1/comprehensions_output` +
    `?select=id,signal_id,owner_id,comprehension,model,comprehended_at,created_at` +
    `&order=created_at.desc&limit=100`;

  const fetchRes = await fetch(fetchUrl, { headers: sbHeaders });
  if (!fetchRes.ok) {
    const detail = await fetchRes.text().catch(() => "");
    return json({ error: "Failed to fetch comprehensions", detail }, 500);
  }

  const allRows: ComprehensionRow[] = await fetchRes.json();

  // 2. Entity matching
  const terms = entities.map((e: string) => e.toLowerCase());
  let relevant: ComprehensionRow[];

  if (terms.length === 0) {
    relevant = allRows.slice(0, 20);
  } else {
    const matched = allRows.filter(row => matchesEntities(row, terms));
    relevant = (matched.length > 0 ? matched : allRows).slice(0, 20);
    console.log(JSON.stringify({ step: "retrieve", total: allRows.length, matched: matched.length, returning: relevant.length }));
  }

  if (relevant.length === 0) {
    return json({ error: "no_comprehensions_found", message: "No comprehension data available" });
  }

  // 3. Call Claude for synthesis
  const userMessage =
    `QUERY:\n${JSON.stringify({ task, entities }, null, 2)}\n\n` +
    `COMPREHENSIONS (${relevant.length} rows):\n` +
    JSON.stringify(
      relevant.map(r => ({
        signal_id: r.signal_id,
        comprehended_at: r.comprehended_at,
        comprehension: r.comprehension,
      })),
      null,
      2
    ) +
    `\n\nReturn a JSON object following the synthesis doctrine output format exactly. Do not include any text outside the JSON object.`;

  const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      "anthropic-beta": "prompt-caching-2024-07-31",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: [{ type: "text", text: SYNTHESIS_DOCTRINE, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!anthropicRes.ok) {
    const errText = await anthropicRes.text().catch(() => "");
    console.log(JSON.stringify({ step: "claude_failed", status: anthropicRes.status, error: errText }));
    return json({ error: "Claude synthesis failed", detail: errText }, 500);
  }

  const anthropicData = await anthropicRes.json();
  const rawText: string = (anthropicData?.content as Array<{ text?: string }>)?.[0]?.text ?? "";
  const jsonText = rawText.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();

  console.log(JSON.stringify({
    step: "synthesized",
    input_tokens: anthropicData?.usage?.input_tokens,
    output_tokens: anthropicData?.usage?.output_tokens,
    cache_read: anthropicData?.usage?.cache_read_input_tokens ?? 0,
  }));

  let synthesis: unknown;
  try {
    synthesis = JSON.parse(jsonText);
  } catch {
    return json({ error: "Failed to parse Claude response", raw: rawText.slice(0, 500) }, 500);
  }

  return json(synthesis);
});
