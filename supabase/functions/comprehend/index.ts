// ============================================================
// Doctrine — loaded once at module startup
// ============================================================

const DOCTRINE =
  `DAAT — Comprehension Doctrine (v1.1)

You are reading one signal from an organization's connected data sources. Your job is to produce a faithful, grounded, non-destructive representation of what this signal contains. You are not summarizing. You are not synthesizing across signals. You are not making judgments about what matters to the organization as a whole.

You are allowed to extract what is plainly present, what can be locally inferred from this signal alone, and what remains uncertain or unresolved. You are not allowed to make cross-signal claims. Do not reference patterns across multiple signals. Do not assert global organizational truths. Do not infer recurrence from a single instance.

Every important extraction must be traceable. If you claim a decision was made, there must be evidence in the signal. If you identify a workflow, there must be something in the signal that grounds that identification. If you are inferring rather than reading directly, reflect that in the grounding and, if needed, in the uncertainty field.

Null means not present or not inferable from this signal. It does not mean the question was irrelevant. Prefer honest null over weak inference.

Your output will be read by a synthesis layer that has access to all signals. Your job is to make each signal legible, not to pre-synthesize it.

Scope of Extraction: Focus your extraction on what this type of signal naturally reveals. Do not force extraction categories that are not meaningful for this signal type. A conversational signal may contain decisions, problems, sentiment, and uncertainty. A financial signal may primarily reveal entities, transactions, and workflow implications. A documentation signal may emphasize workflows, decisions, and gaps. Extract what is genuinely present, not what is theoretically possible. Only include items that are meaningfully supported by the signal. Do not include weak or generic labels.

Extraction Rules: The fundamental unit of output is an extraction object. Each extraction object represents one atomic piece of information present or inferable in the signal. Do not combine multiple distinct ideas into one object. Prefer multiple small extraction objects over fewer large ones. Do not resolve ambiguity unless the signal clearly resolves it. If multiple interpretations are plausible, represent the uncertainty rather than choosing one. Distinguish between what is being said, what is being done, and what is being implied.

Structure of Each Extraction Object: Extraction objects are lightweight items that appear inside typed arrays: workflows, problems, tools, decisions, people, and states. Each item must include a short, groupable label and a grounding reference to the signal. Grounding should point to the relevant part of the signal, either as a short quote or a clear reference to where the information appears.

Handling Uncertainty: If something appears important but is unclear or incomplete, represent it explicitly as uncertainty rather than forcing a conclusion. Uncertainty is first-class output, not a failure. Gap means something referenced but not explained or incomplete in context. Use the uncertainty field for what cannot be confidently determined. Use the tacit field for meaningful context, structure, or implications that do not fit cleanly into structured fields. Do not collapse these two into each other.`;

// ============================================================
// Source-specific prompts — loaded once at module startup
// ============================================================

const PROMPT_SLACK =
  `DAAT reconstructs organizational context from fragmented data across tools like Slack, Notion, QuickBooks, and others. Organizations operate across many systems, but no single system reflects the full, current state of work. DAAT's goal is to make that reality legible without distorting it.

This layer, Comprehension, reads one signal at a time and produces a grounded, structured representation of what that signal contains. It does not summarize for convenience or synthesize across signals. It extracts what is present, preserves what is uncertain, and keeps all outputs traceable to the original data.

Your role in this prompt is to read a single Slack signal and fill in the schema below. The goal is to make this signal legible to a downstream synthesis layer while preserving fidelity to the original content.

---

**Schema**

Grounding should be a short quote or clear reference to where the information appears in the signal.

\`\`\`json
{
  "signal_purpose": "short groupable phrase describing what this signal is trying to accomplish",
  "context": {
    "source": "slack",
    "primary_label": "channel name",
    "secondary": "thread hint or null"
  },
  "workflows": [{ "label": "short groupable phrase", "grounding": "short quote or reference" }],
  "problems": [{ "label": "short groupable phrase", "grounding": "short quote or reference" }],
  "tools": [{ "label": "tool name", "grounding": "short quote or reference" }],
  "decisions": [{ "label": "short groupable phrase", "grounding": "short quote or reference" }],
  "people": [{ "label": "name or reference", "grounding": "short quote or reference" }],
  "states": [{ "label": "current state of something", "grounding": "short quote or reference" }],
  "summary": "few sentences — what happens in this signal",
  "uncertainty": "free prose — what Claude could not confidently determine",
  "tacit": "free prose — implied organizational knowledge that does not fit the structured fields"
}
\`\`\`

---

**Signal type — Slack**

A Slack signal represents one thread or standalone message. It contains conversational data: messages, replies, participants, and channel context. This is real-time, informal communication, not structured documentation.

Slack signals should be treated as partial, evolving views of work, not complete records.

**What Slack signals are good at surfacing**

- Work in motion — active discussions about things currently happening
- Implicit decisions — agreements that emerge through conversation
- Friction and blockers — problems appear here before anywhere else
- Tool usage — tools referenced naturally in context
- Ownership signals — who is responsible often emerges through responses
- Workflow fragments — a thread reflects one moment in a larger process

**What Slack signals are not reliable for**

- Complete context — assume missing background
- Formal decisions — many decisions are implied, not stated
- Final state — resolution may be partial or unclear

**Field-by-field instructions**

\`signal_purpose\` — one short, groupable phrase describing what this thread is trying to accomplish.

\`workflows\` — only include if a recurring process is clearly visible. Do not label one-off discussions as workflows.

\`problems\` — include friction, blockers, confusion, or complaints. Use tight, specific labels. Avoid vague phrases.

\`tools\` — only include tools that are explicitly named or clearly referenced. Do not infer tool usage.

\`decisions\` — only include if something was actually resolved, explicitly or implicitly. Do not include ideas, suggestions, or open discussions.

\`people\` — only include people who play a meaningful role in the signal. Do not include every participant.

\`states\` — include the current state of something specific. Do not generalize across the whole thread.

\`uncertainty\` — describe what is genuinely unclear or unresolved. Focus on ownership, decisions, and next steps.

\`tacit\` — capture meaningful subtext that does not fit structured fields. This may include implied ownership, tone or urgency, power dynamics, what is being avoided or left unsaid.

---

**Hard rules**

- Do not make cross-signal claims. You are reading one signal only.
- Do not assert patterns, recurrence, or organizational truths from a single signal.
- Null means not present or not inferable from this signal. Prefer honest null over weak inference.
- If you are inferring rather than reading directly, reflect that in the grounding and, if needed, in the uncertainty field.
- Only include items that are meaningfully supported by the signal. Do not include weak or generic labels.
- Do not force categories. If a field is not meaningfully present, leave it empty.
- If a field is not present, return an empty array [] for list fields and null for scalar fields.
- Keep all labels short, specific, and groupable.
- Your output must be valid JSON matching the schema exactly. Do not include any text outside the JSON object.`;

const PROMPT_NOTION =
  `### Signal type — Notion / Documentation

A Notion signal represents one page or section of a page. It contains written documentation: processes, plans, notes, or reference material.

Unlike Slack, this is not work in motion. It is work that was important enough to write down. However, written documentation may be incomplete, outdated, or inconsistent with actual practice.

Treat Notion signals as intentional but potentially stale or partial representations of how work is supposed to function.

---

### What Notion signals are good at surfacing

- Intended workflows — how work is supposed to be done
- Documented decisions — what was decided and recorded
- Structured knowledge — processes, definitions, and systems
- Project context — goals, plans, and rationale
- Assumptions — what the author expects the reader to already know

---

### What Notion signals are not reliable for

- Current state — the page may be outdated
- Completeness — documentation is often partial or abandoned
- Accuracy — what is written may not reflect actual behavior
- Ownership — responsibility is often unclear or unstated
- Currency — pages may be outdated relative to actual practice

---

### Field-by-field instructions

Each item in workflows, problems, tools, decisions, people, and states must include a grounding reference to where it appears in the signal.

**signal_purpose**

One short, groupable phrase describing what this page or section is trying to document or define.

**workflows**

Include clearly described processes or procedures.

Prefer structured, repeatable processes over one-off descriptions.

**problems**

Include explicitly documented issues, gaps, or known limitations.

Also include implied friction where the documentation reveals breakdowns or missing pieces.

**tools**

Include tools that are explicitly part of the documented process or system.

Do not infer tools that are not mentioned.

**decisions**

Include decisions that are clearly documented or implied through the structure of the page.

Do not include speculative or proposed ideas unless they are presented as decided.

**people**

Only include people if they are explicitly referenced in a meaningful role.

Do not infer ownership unless it is clearly indicated.

**states**

Include any described state of a process, project, or system, for example planned, in progress, deprecated.

Treat these as descriptive, not necessarily current.

Only include states that are explicitly described or clearly implied. Do not infer current state beyond what is supported.

**uncertainty**

Describe what is unclear, incomplete, or missing.

Focus on:

- gaps in the process
- missing steps or definitions
- unclear ownership
- signs the page may be outdated

Also include signals that the page may not reflect current practice, especially if:

- it has not been updated recently
- it appears incomplete or abandoned
- it assumes context not defined in the page

Return this field as one prose string only. Do not return an array, list, bullet points, or structured objects for uncertainty.

**tacit**

Capture what the structure and tone of the page imply but do not state directly.

This may include:

- assumptions about how things actually work
- differences between documented process and likely reality
- signs of neglect, staleness, or lack of maintenance
- what appears important based on how the page is structured

---

### Additional rules

- Do not assume the documentation is current or accurate.
- Do not treat written processes as necessarily reflective of real behavior.
- Do not declare a page as outdated or incorrect. Only surface signals that suggest it may not reflect current reality.
- Do not overpopulate fields. Only include what is clearly supported.
- Prefer omission over weak or generic labels.
- Keep all labels short, specific, and groupable.
- Do not restate large portions of the document in summary. Keep summary concise and focused on what matters.

---

### Hard rules

- Do not make cross-signal claims. You are reading one signal only.
- Do not assert patterns, recurrence, or organizational truths from a single signal.
- Null means not present or not inferable from this signal. Prefer honest null over weak inference.
- If you are inferring rather than reading directly, reflect that in the grounding and, if needed, in the uncertainty field.
- Only include items that are meaningfully supported by the signal. Do not include weak or generic labels.
- Do not force categories. If a field is not meaningfully present, leave it empty.
- If a field is not present, return an empty array [] for list fields and null for scalar fields.
- Do not include duplicate labels within a field.
- Keep all labels short, specific, and groupable.
- Your output must be valid JSON matching the schema exactly. Do not include any text outside the JSON object.
- For Notion signals, uncertainty must always be returned as a single prose string, never as an array, list, or object.`;

const PROMPT_QUICKBOOKS =
  `DAAT reconstructs organizational context from fragmented data across tools like Slack, Notion, QuickBooks, and others. Organizations operate across many systems, but no single system reflects the full, current state of work. DAAT's goal is to make that reality legible without distorting it.

This layer, Comprehension, reads one signal at a time and produces a grounded, structured representation of what that signal contains. It does not summarize for convenience or synthesize across signals. It extracts what is present, preserves what is uncertain, and keeps all outputs traceable to the original data.

Your role in this prompt is to read a single QuickBooks signal and fill in the schema below. The goal is to make this signal legible to a downstream synthesis layer while preserving fidelity to the original content.

---

## Schema

Grounding should be a short quote or clear reference to where the information appears in the signal.

\`\`\`
{
  "signal_purpose":"short groupable phrase describing what this signal is trying to accomplish",
  "context": {
    "source":"quickbooks",
    "primary_label":"vendor name if present, otherwise transaction type",
    "secondary":"optional — amount, category, or transaction date. null if not useful"
  },
  "workflows": [{ "label":"short groupable phrase", "grounding":"reference to signal" }],
  "problems": [{ "label":"short groupable phrase", "grounding":"reference to signal" }],
  "tools": [{ "label":"tool name", "grounding":"reference to signal" }],
  "decisions": [{ "label":"short groupable phrase", "grounding":"reference to signal" }],
  "people": [{ "label":"name or reference", "grounding":"reference to signal" }],
  "states": [{ "label":"current state of something", "grounding":"reference to signal" }],
  "summary":"few sentences — what happens in this signal",
  "uncertainty":"free prose — what Claude could not confidently determine",
  "tacit":"free prose — implied organizational knowledge that does not fit the structured fields"
}
\`\`\`

---

## Signal type — QuickBooks / Financial Transaction

A QuickBooks signal represents a single financial transaction. It contains structured data about money moving into or out of the organization.

Unlike Slack and Notion, this is not conversational or descriptive. It is a record of an event that has already happened, with explicit fields attached to it.

Treat QuickBooks signals as factually reliable but contextually limited. The data is accurate, but the reason behind it is often not present.

---

## What QuickBooks signals are good at surfacing

- Vendor relationships — who the company pays or gets paid by
- Financial activity — amounts, categories, and transaction types
- Tool and service usage — recurring payments to software or vendors
- Workflow positions — where a transaction sits in a broader process
- Spend patterns — size, frequency, and category of transactions

---

## What QuickBooks signals are not reliable for

- Context — transactions do not explain why money moved
- People — individuals responsible are not present
- Decisions — the decision happened before the transaction
- Current state — this is a past event, not a live status

---

## Field-by-field instructions

Each item in workflows, problems, tools, decisions, people, and states must include a grounding reference to where it appears in the signal.

**signal_purpose**

One short, groupable phrase describing what this transaction represents, for example vendor payment, customer invoice, or expense recording.

**workflows**

Include the likely workflow this transaction belongs to, if clearly implied by the transaction type or vendor.

Examples: vendor payment, accounts payable, invoicing, subscription billing.

Only include if the workflow is reasonably clear from the data.

**problems**

Include issues visible in the data, such as:

- missing or vague memo
- uncategorized or unclear category
- inconsistent or incomplete fields

Do not infer problems beyond what is directly observable.

**tools**

Include tools or services when the vendor clearly represents a software or service provider.

Use vendor name as the label.

Do not infer tools if the vendor is ambiguous.

Do not label generic vendors or individuals as tools.

**decisions**

Only include if a decision is clearly implied by the transaction, such as committing to a payment or issuing an invoice.

Keep labels simple.

Do not infer broader strategic decisions.

**people**

Only include if a person is explicitly named in the transaction data.

Most QuickBooks signals will not include people.

**states**

Include the transactional state if relevant, such as paid, billed, invoiced, or pending.

Do not infer broader operational state.

**uncertainty**

Describe what is unclear or missing, such as:

- unclear purpose of the transaction
- missing memo or description
- ambiguous vendor or category
- lack of context for why the transaction occurred

**tacit**

Capture what can be reasonably inferred from the structure of the transaction without overreaching.

This may include:

- likely vendor relationship type
- recurring vs one-off nature of the transaction
- what this suggests about tools or services in use

Keep this grounded and minimal. Do not speculate.

Do not infer internal strategy, priorities, or intent beyond what is directly supported by the transaction.

---

## Additional rules

- Prefer extraction over interpretation. Most relevant information is explicitly present.
- Do not over-infer organizational meaning from financial data.
- Use vendor names and categories precisely as given.
- Prefer exact field values over reworded interpretations.
- Do not overpopulate fields. Only include what is clearly supported.
- Prefer omission over weak or generic labels.
- Keep all labels short, specific, and groupable.
- Keep summary factual and concise. Do not speculate about intent.

---

## Hard rules

- Do not make cross-signal claims. You are reading one signal only.
- Do not assert patterns, recurrence, or organizational truths from a single signal.
- Null means not present or not inferable from this signal. Prefer honest null over weak inference.
- If you are inferring rather than reading directly, reflect that in the grounding and, if needed, in the uncertainty field.
- Only include items that are meaningfully supported by the signal. Do not include weak or generic labels.
- Do not force categories. If a field is not meaningfully present, leave it empty.
- If a field is not present, return an empty array [] for list fields and null for scalar fields.
- Do not include duplicate labels within a field.
- Keep all labels short, specific, and groupable.
- Your output must be valid JSON matching the schema exactly. Do not include any text outside the JSON object.`;

// ============================================================
// Types
// ============================================================

interface SignalCore {
  source: string;
  raw_content: unknown;
  content_archetype: string;
}

interface AssemblyRow {
  id: string;
  signal_id: string;
  owner_id: string;
  source_data: unknown;
  signals_core: SignalCore;
}

// ============================================================
// Prompt selection
// ============================================================

function selectPrompt(contentArchetype: string): string | null {
  switch (contentArchetype) {
    case "conversational":
      return PROMPT_SLACK;
    case "documentation":
      return PROMPT_NOTION;
    case "financial":
      return PROMPT_QUICKBOOKS;
    default:
      return null;
  }
}

// ============================================================
// Schema validation and normalization
//
// Rules:
//   - context: missing/null → null; present but not a plain object → throw
//   - array fields: missing/null → []; present but not array → throw;
//     items must be plain objects with label: string and grounding: string → throw if not
//   - scalar fields: missing/undefined → null; present but not string or null → throw
// ============================================================

const ARRAY_FIELDS = [
  "workflows",
  "problems",
  "tools",
  "decisions",
  "people",
  "states",
] as const;

const SCALAR_FIELDS = [
  "signal_purpose",
  "summary",
  "uncertainty",
  "tacit",
] as const;

function validateAndNormalize(parsed: unknown): Record<string, unknown> {
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("top-level value is not a plain object");
  }

  const obj = parsed as Record<string, unknown>;
  const result: Record<string, unknown> = {};

  // context
  if (!("context" in obj) || obj.context === undefined || obj.context === null) {
    result.context = null;
  } else {
    const ctx = obj.context;
    if (typeof ctx !== "object" || Array.isArray(ctx)) {
      throw new Error("context is present but is not a plain object");
    }
    result.context = ctx;
  }

  // array fields
  for (const field of ARRAY_FIELDS) {
    const val = obj[field];
    if (val === undefined || val === null) {
      result[field] = [];
      continue;
    }
    if (!Array.isArray(val)) {
      throw new Error(`${field} is present but is not an array`);
    }
    for (let i = 0; i < val.length; i++) {
      const item = val[i];
      if (typeof item !== "object" || item === null || Array.isArray(item)) {
        throw new Error(`${field}[${i}] is not a plain object`);
      }
      const itemObj = item as Record<string, unknown>;
      if (typeof itemObj.label !== "string") {
        throw new Error(`${field}[${i}].label is missing or not a string`);
      }
      if (typeof itemObj.grounding !== "string") {
        throw new Error(`${field}[${i}].grounding is missing or not a string`);
      }
    }
    result[field] = val;
  }

  // scalar fields
  for (const field of SCALAR_FIELDS) {
    if (!(field in obj) || obj[field] === undefined) {
      result[field] = null;
      continue;
    }
    const val = obj[field];
    if (val === null || typeof val === "string") {
      result[field] = val;
    } else if (Array.isArray(val)) {
      result[field] = val.join(" ");
    } else {
      throw new Error(`${field} is present but is not a string, array, or null`);
    }
  }

  return result;
}

// ============================================================
// Notion preprocessing — Layer 1
//
// Strips all block-level API metadata (ids, timestamps, user refs,
// annotations, colors) and converts blocks to a compact markdown
// representation. Reduces payload by ~75–80% for typical pages.
// ============================================================

const NOTION_DIRECT_THRESHOLD = 20_000; // chars; at or below → one Claude call
const NOTION_CHUNK_TARGET     = 15_000; // chars per chunk (target, not hard cap)

// Size guard — signals above these thresholds are skipped (comprehended_at set)
// so they stop blocking the build queue. Re-enable later by clearing comprehended_at
// via SQL if/when the processing path is made robust enough to handle them.
const MAX_RAW_CONTENT_BYTES    = 500_000; // ~500 KB serialized raw_content (all sources)
const MAX_NOTION_CLEANED_CHARS = 250_000; // cleaned markdown length after preprocessing

// Source-aware default row limits per comprehend invocation.
// Notion is 1 because a single page can expand into many Claude calls via chunking.
const DEFAULT_LIMIT_BY_SOURCE: Record<string, number> = {
  notion:     1,
  slack:      8,
  quickbooks: 8,
};
const DEFAULT_LIMIT_FALLBACK = 5;

// Extract plain text from a Notion rich_text array.
function extractRichText(rt: unknown): string {
  if (!Array.isArray(rt)) return "";
  return (rt as Array<Record<string, unknown>>)
    .map(span => (typeof span?.plain_text === "string" ? span.plain_text : ""))
    .join("");
}

// Convert one Notion block to a single markdown-style line.
function blockToLine(block: Record<string, unknown>): string {
  const type = block.type as string;
  const content = block[type] as Record<string, unknown> | undefined;

  switch (type) {
    case "heading_1":          return `# ${extractRichText(content?.rich_text)}`;
    case "heading_2":          return `## ${extractRichText(content?.rich_text)}`;
    case "heading_3":          return `### ${extractRichText(content?.rich_text)}`;
    case "paragraph":          return extractRichText(content?.rich_text);
    case "bulleted_list_item": return `- ${extractRichText(content?.rich_text)}`;
    case "numbered_list_item": return `1. ${extractRichText(content?.rich_text)}`;
    case "quote":              return `> ${extractRichText(content?.rich_text)}`;
    case "callout":            return `> ${extractRichText(content?.rich_text)}`;
    case "toggle":             return extractRichText(content?.rich_text);
    case "to_do": {
      const checked = content?.checked ? "[x]" : "[ ]";
      return `${checked} ${extractRichText(content?.rich_text)}`;
    }
    case "code": {
      const lang = typeof content?.language === "string" ? content.language : "";
      return `\`\`\`${lang}\n${extractRichText(content?.rich_text)}\n\`\`\``;
    }
    case "child_page":
      return `[child page: ${typeof content?.title === "string" ? content.title : ""}]`;
    case "divider":
      return "---";
    default:
      return content?.rich_text ? extractRichText(content.rich_text) : "";
  }
}

// Build the page header string (title + breadcrumb) from raw_content and source_data.
function buildPageHeader(rawContent: unknown, sourceData: unknown): string {
  const raw = rawContent as Record<string, unknown>;
  const sd  = sourceData  as Record<string, unknown>;

  const page     = raw?.page as Record<string, unknown> | undefined;
  const titleProp = (page?.properties as Record<string, unknown>)?.title as Record<string, unknown> | undefined;
  const title    = extractRichText(titleProp?.title) || "(untitled)";

  let breadcrumb: string[] = [];
  if (typeof sd?.breadcrumb === "string") {
    try { breadcrumb = JSON.parse(sd.breadcrumb); } catch { /* skip */ }
  } else if (Array.isArray(sd?.breadcrumb)) {
    breadcrumb = sd.breadcrumb as string[];
  }

  const parts = [`PAGE: ${title}`];
  if (breadcrumb.length > 0) parts.push(`BREADCRUMB: ${breadcrumb.join(" > ")}`);
  return parts.join("\n");
}

// Line representation used for chunking decisions.
interface NotionLine {
  text: string;
  isSectionBreak: boolean; // true for heading_1 / heading_2 — natural chunk boundaries
}

// Convert all blocks in raw_content to NotionLine objects (empty lines filtered out).
function blocksToLines(rawContent: unknown): NotionLine[] {
  const raw    = rawContent as Record<string, unknown>;
  const blocks = Array.isArray(raw?.blocks)
    ? (raw.blocks as Array<Record<string, unknown>>)
    : [];

  const SECTION_BREAK_TYPES = new Set(["heading_1", "heading_2"]);
  return blocks
    .map(block => ({
      text:           blockToLine(block),
      isSectionBreak: SECTION_BREAK_TYPES.has(block.type as string),
    }))
    .filter(l => l.text.trim() !== "");
}

// Build the full page content as a single string (used for direct, non-chunked path).
function buildFullContent(header: string, lines: NotionLine[]): string {
  return [header, "", ...lines.map(l => l.text)].join("\n");
}

// ============================================================
// Notion preprocessing — Layer 2: chunking
//
// Splits lines into chunks at heading_1/heading_2 boundaries,
// greedily packing sections to stay near NOTION_CHUNK_TARGET.
// Each chunk gets the page header for context.
// ============================================================

function chunkPageLines(header: string, lines: NotionLine[]): string[] {
  if (lines.length === 0) return [header];

  // Group consecutive lines into sections; each new heading_1/heading_2 starts a section.
  const sections: string[][] = [[]];
  for (const line of lines) {
    if (line.isSectionBreak && sections[sections.length - 1].length > 0) {
      sections.push([]);
    }
    sections[sections.length - 1].push(line.text);
  }

  // Greedily pack sections into chunks targeting NOTION_CHUNK_TARGET chars.
  const chunks: string[] = [];
  let chunkParts: string[] = [];
  let chunkBodyLen = 0;

  for (const section of sections) {
    const sectionText = section.join("\n");
    if (chunkBodyLen + sectionText.length > NOTION_CHUNK_TARGET && chunkParts.length > 0) {
      chunks.push(`${header}\n\n${chunkParts.join("\n")}`);
      chunkParts   = [sectionText];
      chunkBodyLen = sectionText.length;
    } else {
      chunkParts.push(sectionText);
      chunkBodyLen += sectionText.length;
    }
  }
  if (chunkParts.length > 0) {
    chunks.push(`${header}\n\n${chunkParts.join("\n")}`);
  }

  return chunks.length > 0 ? chunks : [header];
}

// ============================================================
// Notion preprocessing — Layer 3: merge
//
// Merges multiple per-chunk comprehension objects into one.
// Array fields: concatenated and deduplicated by label.
// Prose fields: joined with a space.
// ============================================================

function mergeArrayField(
  chunks: Record<string, unknown>[],
  field: string,
): unknown[] {
  const seen   = new Set<string>();
  const result: unknown[] = [];
  for (const chunk of chunks) {
    const arr = chunk[field];
    if (!Array.isArray(arr)) continue;
    for (const item of arr) {
      const label = String((item as Record<string, unknown>)?.label ?? "").toLowerCase().trim();
      if (label && !seen.has(label)) {
        seen.add(label);
        result.push(item);
      }
    }
  }
  return result;
}

function mergeChunkComprehensions(
  chunks: Record<string, unknown>[],
): Record<string, unknown> {
  if (chunks.length === 1) return chunks[0];

  const merged: Record<string, unknown> = {};

  // Structural fields from first chunk
  merged.context        = chunks[0].context ?? null;
  merged.signal_purpose = chunks.find(c => c.signal_purpose != null)?.signal_purpose ?? null;

  // Array fields: concat + deduplicate by label
  for (const field of ["workflows", "problems", "tools", "decisions", "people", "states"]) {
    merged[field] = mergeArrayField(chunks, field);
  }

  // Prose fields: join non-null, non-empty values
  const joinProse = (field: string): string | null =>
    chunks
      .map(c => c[field])
      .filter(v => v && typeof v === "string")
      .join(" ") || null;

  merged.summary     = joinProse("summary");
  merged.uncertainty = joinProse("uncertainty");
  merged.tacit       = joinProse("tacit");

  return merged;
}

// ============================================================
// Single-call Claude helper
//
// Encapsulates: API call → rate-limit sleep → JSON strip →
// JSON.parse → validateAndNormalize.
// Always sleeps 2 s before returning (success or failure) to
// respect rate limits.
// ============================================================

async function callClaude(
  userMessage: string,
  anthropicApiKey: string,
  signal_id: string,
  chunkCtx?: { chunk: number; total_chunks: number },
): Promise<
  | { ok: true;  comprehension: Record<string, unknown> }
  | { ok: false; error: Record<string, unknown> }
> {
  const ctx: Record<string, unknown> = chunkCtx ?? {};

  let anthropicData: Record<string, unknown>;

  try {
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key":           anthropicApiKey,
        "anthropic-version":   "2023-06-01",
        "content-type":        "application/json",
      },
      body: JSON.stringify({
        model:      "claude-sonnet-4-6",
        max_tokens: 4096,
        system:     DOCTRINE,
        messages:   [{ role: "user", content: userMessage }],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text().catch(() => "");
      await new Promise(r => setTimeout(r, 2000));
      return {
        ok: false,
        error: { reason: "anthropic_api_failed", signal_id, ...ctx, status: anthropicRes.status, error: errText },
      };
    }

    anthropicData = await anthropicRes.json();
  } catch (e) {
    await new Promise(r => setTimeout(r, 2000));
    return {
      ok: false,
      error: { reason: "anthropic_api_failed", signal_id, ...ctx, error: String(e) },
    };
  }

  // Rate-limit buffer after every successful API call
  await new Promise(r => setTimeout(r, 2000));

  const rawText: string =
    (anthropicData?.content as Array<{ text?: string }>)?.[0]?.text ?? "";
  const jsonText = rawText
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e) {
    return {
      ok: false,
      error: {
        reason:   "json_parse_failed",
        signal_id,
        ...ctx,
        error:    String(e),
        raw_text: rawText.slice(0, 500),
      },
    };
  }

  try {
    const comprehension = validateAndNormalize(parsed);
    return { ok: true, comprehension };
  } catch (e) {
    return {
      ok: false,
      error: { reason: "schema_validation_failed", signal_id, ...ctx, error: String(e) },
    };
  }
}

// ============================================================
// Assembly row bookkeeping
// ============================================================

// Mark an assembly row as processed (comprehended_at = now) without inserting
// into comprehensions_output. Used to skip oversized or unprocessable signals
// so they stop blocking the build queue. Returns true on success.
async function markAssemblyProcessed(
  supabaseUrl: string,
  sbHeaders: Record<string, string>,
  assemblyId: string,
): Promise<boolean> {
  const res = await fetch(
    `${supabaseUrl}/rest/v1/comprehensions_assembly?id=eq.${assemblyId}`,
    {
      method:  "PATCH",
      headers: sbHeaders,
      body:    JSON.stringify({ comprehended_at: new Date().toISOString() }),
    },
  );
  return res.ok;
}

// ============================================================
// Main handler
// ============================================================

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  const url = new URL(req.url);
  const limitParam  = url.searchParams.get("limit");
  const sourceParam = url.searchParams.get("source");

  // Source-aware default limit. Explicit ?limit= still wins.
  const defaultLimit = sourceParam
    ? (DEFAULT_LIMIT_BY_SOURCE[sourceParam] ?? DEFAULT_LIMIT_FALLBACK)
    : DEFAULT_LIMIT_FALLBACK;
  const limit = limitParam ? Math.max(1, parseInt(limitParam, 10)) : defaultLimit;

  const supabaseUrl       = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anthropicApiKey   = Deno.env.get("ANTHROPIC_API_KEY")!;

  const sbHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization:  `Bearer ${supabaseServiceKey}`,
    apikey:         supabaseServiceKey,
  };

  // 1. Fetch pending assembly rows.
  //    If ?source= is given, filter to that source. Otherwise exclude google
  //    (google = access archetype, not comprehended by this function).
  const sourceFilter = sourceParam
    ? `&signals_core.source=eq.${encodeURIComponent(sourceParam)}`
    : `&signals_core.source=neq.google`;

  const queryUrl =
    `${supabaseUrl}/rest/v1/comprehensions_assembly` +
    `?select=id,signal_id,owner_id,source_data,signals_core!inner(source,raw_content,content_archetype)` +
    `&comprehended_at=is.null` +
    sourceFilter;

  console.log(JSON.stringify({
    step: "comprehend_invoked",
    source: sourceParam ?? "all",
    limit,
  }));

  const fetchRes = await fetch(queryUrl, { headers: sbHeaders });
  if (!fetchRes.ok) {
    const detail = await fetchRes.text().catch(() => "");
    return new Response(
      JSON.stringify({ error: "Failed to fetch pending signals", detail }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }

  const allRows: AssemblyRow[] = await fetchRes.json();
  const rows = allRows.slice(0, limit);

  let succeeded = 0;
  let failed    = 0;
  let skipped   = 0;
  const errors: unknown[] = [];

  // 2. Process sequentially
  for (const row of rows) {
    const { id: assemblyId, signal_id, owner_id, source_data } = row;
    const { source, content_archetype, raw_content } = row.signals_core;

    const rawSize = JSON.stringify(raw_content).length;
    console.log(JSON.stringify({
      step: "begin_signal",
      signal_id,
      source,
      content_archetype,
      raw_size: rawSize,
    }));

    // 2a. Select prompt based on content_archetype
    const sourcePrompt = selectPrompt(content_archetype);
    if (sourcePrompt === null) {
      const e0 = { reason: "prompt_selection_failed", signal_id, source, content_archetype };
      console.log(JSON.stringify(e0)); errors.push(e0);
      skipped++;
      continue;
    }

    // 2a-guard. Global size guard — skip oversized signals so they stop blocking the queue.
    if (rawSize > MAX_RAW_CONTENT_BYTES) {
      const reason = "raw_content_oversized";
      console.log(JSON.stringify({
        reason, signal_id, source, raw_size: rawSize, max: MAX_RAW_CONTENT_BYTES,
      }));
      errors.push({ reason, signal_id, source, raw_size: rawSize });
      const marked = await markAssemblyProcessed(supabaseUrl, sbHeaders, assemblyId);
      if (marked) skipped++; else failed++;
      continue;
    }

    // 2b–2e. Build message(s) and call Claude.
    //
    // Notion / documentation path: preprocess raw blocks into compact markdown,
    // then chunk by heading sections if the cleaned text exceeds the direct
    // threshold. All other archetypes use the original raw-JSON path.
    let comprehension!: Record<string, unknown>;

    if (content_archetype === "documentation") {
      // Layer 1 — preprocess
      const rawLen      = JSON.stringify(raw_content).length;
      const header      = buildPageHeader(raw_content, source_data);
      const lines       = blocksToLines(raw_content);
      const fullContent = buildFullContent(header, lines);
      const cleanedLen  = fullContent.length;

      // Notion-specific size guard — skip pages whose cleaned content is still huge
      // after preprocessing (long handbooks, database dumps). Keeps the queue moving.
      if (cleanedLen > MAX_NOTION_CLEANED_CHARS) {
        const reason = "notion_cleaned_oversized";
        console.log(JSON.stringify({
          reason, signal_id, source, raw_len: rawLen, cleaned_len: cleanedLen, max: MAX_NOTION_CLEANED_CHARS,
        }));
        errors.push({ reason, signal_id, source, cleaned_len: cleanedLen });
        const marked = await markAssemblyProcessed(supabaseUrl, sbHeaders, assemblyId);
        if (marked) skipped++; else failed++;
        continue;
      }

      const isChunked   = cleanedLen > NOTION_DIRECT_THRESHOLD;
      const inputs      = isChunked ? chunkPageLines(header, lines) : [fullContent];

      console.log(JSON.stringify({
        step:        "notion_prepare",
        signal_id,
        source,
        raw_len:     rawLen,
        cleaned_len: cleanedLen,
        chunked:     isChunked,
        chunks:      inputs.length,
      }));

      // Layer 2 — call Claude once per chunk (or once for direct path)
      const chunkResults: Record<string, unknown>[] = [];
      let signalFailed = false;

      for (let ci = 0; ci < inputs.length; ci++) {
        const chunkCtx = isChunked
          ? { chunk: ci + 1, total_chunks: inputs.length }
          : undefined;
        const chunkLabel = isChunked
          ? `[Chunk ${ci + 1} of ${inputs.length} — comprehend only what appears in this excerpt.]\n\n`
          : "";
        const userMessage =
          `${sourcePrompt}\n\n` +
          `---\n\n` +
          `SOURCE DATA JSON: ${JSON.stringify(source_data)}\n\n` +
          `NOTION PAGE CONTENT:\n${chunkLabel}${inputs[ci]}\n\n` +
          `Return only valid JSON matching the schema exactly. Do not include any text outside the JSON object.`;

        const result = await callClaude(userMessage, anthropicApiKey, signal_id, chunkCtx);
        if (!result.ok) {
          const enriched = { ...result.error, source };
          console.log(JSON.stringify(enriched));
          errors.push(enriched);
          signalFailed = true;
          break;
        }
        chunkResults.push(result.comprehension);
      }

      if (signalFailed) { failed++; continue; }

      // Layer 3 — merge if chunked
      if (isChunked) {
        try {
          const merged = mergeChunkComprehensions(chunkResults);
          comprehension = validateAndNormalize(merged);
          console.log(JSON.stringify({
            step:          "notion_merge",
            signal_id,
            chunks_merged: chunkResults.length,
          }));
        } catch (e) {
          const emrg = { reason: "merge_failed", signal_id, source, error: String(e) };
          console.log(JSON.stringify(emrg)); errors.push(emrg);
          failed++;
          continue;
        }
      } else {
        comprehension = chunkResults[0];
      }

    } else {
      // Original path — Slack and QuickBooks: send raw JSON unchanged
      const userMessage =
        `${sourcePrompt}\n\n` +
        `---\n\n` +
        `SOURCE DATA JSON: ${JSON.stringify(source_data)}\n\n` +
        `RAW CONTENT JSON: ${JSON.stringify(raw_content)}\n\n` +
        `Return only valid JSON matching the schema exactly. Do not include any text outside the JSON object.`;

      const result = await callClaude(userMessage, anthropicApiKey, signal_id);
      if (!result.ok) {
        const enriched = { ...result.error, source };
        console.log(JSON.stringify(enriched));
        errors.push(enriched);
        failed++;
        continue;
      }
      comprehension = result.comprehension;
    }

    // 2f. Insert into comprehensions_output (must succeed before updating assembly)
    const now = new Date().toISOString();
    const insertRes = await fetch(
      `${supabaseUrl}/rest/v1/comprehensions_output`,
      {
        method:  "POST",
        headers: { ...sbHeaders, Prefer: "return=minimal" },
        body:    JSON.stringify({
          signal_id,
          assembly_id:     assemblyId,
          owner_id,
          comprehension,
          model:           "claude-sonnet-4-6",
          comprehended_at: now,
        }),
      },
    );

    if (!insertRes.ok) {
      let errBody: Record<string, unknown> = {};
      try {
        errBody = await insertRes.json();
      } catch { /* ignore parse failure */ }

      if ((errBody?.code as string) === "23505") {
        console.log(JSON.stringify({ reason: "already_processed", signal_id }));
        skipped++;
        continue;
      }

      const e5 = { reason: "output_insert_failed", signal_id, error: errBody };
      console.log(JSON.stringify(e5)); errors.push(e5);
      failed++;
      continue;
    }

    // 2g. Update comprehensions_assembly only after insert succeeds
    const updateRes = await fetch(
      `${supabaseUrl}/rest/v1/comprehensions_assembly?id=eq.${assemblyId}`,
      {
        method:  "PATCH",
        headers: sbHeaders,
        body:    JSON.stringify({ comprehended_at: now }),
      },
    );

    if (!updateRes.ok) {
      let errBody: Record<string, unknown> = {};
      try {
        errBody = await updateRes.json();
      } catch { /* ignore parse failure */ }

      const e6 = { reason: "assembly_update_failed", signal_id, assembly_id: assemblyId, error: errBody };
      console.log(JSON.stringify(e6)); errors.push(e6);
      failed++;
      continue;
    }

    succeeded++;
  }

  return new Response(
    JSON.stringify({ succeeded, failed, skipped, errors }),
    { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
  );
});
