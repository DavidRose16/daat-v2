# DAAT v2 — Permanent Project Context

Read this file at the start of every session.

---

## What We Are Building

DAAT v2 is an organizational intelligence platform. It ingests data from company integrations, understands that data using Claude, and produces actionable intelligence about how the company operates. The database is built in clean layers where each layer adds complexity without replacing what came before.

---

## Stack

- **Database:** Supabase — project ID `wkimwkhysvvkrujsefyv`
- **Edge functions:** Deno TypeScript deployed to Supabase
- **Frontend:** Does not exist yet — building database and edge functions first

---

## Layer 0 — Connections

Four tables: `connections_quickbooks`, `connections_google`, `connections_slack`, `connections_notion`

Each holds OAuth credentials and workspace metadata for one company's connection to that source. `owner_id` defaults to `'default'` for now. All tables have RLS enabled with permissive policies.

---

## Layer 1 — Signals

Five tables. This is the most important layer to understand.

**`signals_core`** — the universal spine. Every signal from every source gets a row here. Ten columns:

| Column | Description |
|---|---|
| `id` | uuid PK |
| `owner_id` | text, defaults to 'default' |
| `source` | one of: quickbooks, google_workspace, slack, notion |
| `content_archetype` | one of: documentation, conversational, financial, access |
| `source_record_id` | native ID from the source system |
| `raw_content` | jsonb, unmodified payload from source |
| `processing_status` | ingested → enriched |
| `ingested_at` | when raw_content was populated |
| `enriched_at` | when structural enrichment completed (nullable) |
| `created_at` | row creation timestamp |

**Source-specific tables** — one per integration, holds structural metadata for that source:

- `signals_notion`
- `signals_slack`
- `signals_quickbooks`
- `signals_google`

Each connects back to `signals_core` via `signal_id` as a foreign key with cascade delete.

**Content archetype mapping:**
- Notion → `documentation`
- Slack → `conversational`
- QuickBooks → `financial`
- Google → `access`

**Processing status values:**
- `ingested` — raw_content populated, structural enrichment not yet done
- `enriched` — structural context populated in source-specific table

---

## The Signals Pattern — Follow Without Exception

### Writing a signal

1. Insert into `signals_core` first
2. Get the returned `id`
3. Insert into the source-specific table using that `id` as `signal_id`
4. Both inserts happen as one atomic operation — if either fails, roll back both

### Reading a signal

1. Always start from `signals_core`
2. Join to the source-specific table on `signal_id`
3. Never query just the source-specific table alone

---

## Layer 2 — Comprehension

One table: `comprehensions_assembly`. Full doctrine, JSONB schema, and prompt guidance live in `docs/layers/layer-2-comprehension.md`.

| Column | Description |
|---|---|
| `id` | uuid PK |
| `signal_id` | uuid FK → signals_core(id), cascade delete, unique |
| `owner_id` | text, defaults to 'default' |
| `comprehension` | jsonb, nullable — filled in by Claude when job runs |
| `status` | text, defaults to 'pending' — one of: pending, processing, completed, failed |
| `model` | text, nullable — which Claude model produced it |
| `produced_at` | timestamptz, nullable — when Claude ran |
| `created_at` | timestamptz |

### Doctrine (summary)

- One comprehension per signal. Enforced by unique constraint on `signal_id`.
- A comprehension row is created with `status = 'pending'` when a signal arrives.
- The comprehend function picks up pending rows, calls Claude, and writes the result back.
- **The comprehend function reads from and writes to the `comprehensions_assembly` table only.** It joins to `signals_core` and source-specific tables to build context for Claude, but it never inserts, updates, or deletes rows in those tables.
- The `comprehension` JSONB column follows a versioned schema (current: v1). See `docs/layers/layer-2-comprehension.md` for the full schema.

JSONB schema not yet finalized. See docs/layers/layer-2-comprehension.md.

---

---

## Layer 3 — Synthesis

One table read: `comprehensions_output` (the output of Layer 2).

The synthesis layer takes a query (task + entities) from an AI agent, retrieves relevant comprehension rows, and uses Claude to produce a grounded, structured context briefing.

Full doctrine lives in `docs/layers/synthesis-doctrine.md`.

### Components

**`src/synthesize.js`** — Node.js module with two exported functions:
- `retrieveComprehensions({ task, entities })` — queries `comprehensions_output`, matches entity names against people/workflows/decisions/problems labels, returns up to 20 rows ordered by recency.
- `synthesize(query, comprehensions)` — loads the doctrine from `docs/layers/synthesis-doctrine.md`, calls `claude-sonnet-4-6` with prompt caching on the doctrine, returns parsed JSON.

Run directly as a test harness: `node src/synthesize.js`

**`supabase/functions/synthesize/index.ts`** — Deno edge function deployed to Supabase. Accepts `POST { task: string, entities: string[] }`. Returns synthesis JSON.

Endpoint: `https://wkimwkhysvvkrujsefyv.supabase.co/functions/v1/synthesize`

**`mcp/index.js`** — MCP server exposing one tool: `query_daat`. Takes `task` and `entities`, calls the synthesize endpoint, returns the structured response. Runs on stdio. Install with `npm install`, run with `node mcp/index.js`.

### Synthesis output schema

```json
{
  "summary": "2-4 sentence grounded synthesis",
  "context": {
    "decisions": [],
    "people": [],
    "workflows": [],
    "problems": [],
    "tacit_context": "string or null",
    "uncertainty": "string or null"
  },
  "confidence": "high | medium | low",
  "sources": []
}
```

### Runtime requirements

`.env` must contain:
- `VITE_SUPABASE_URL` — Supabase project URL
- `VITE_SUPABASE_ANON_KEY` — Supabase anon key
- `ANTHROPIC_API_KEY` — required for `src/synthesize.js` and `mcp/index.js`

The Deno edge function reads secrets from Supabase environment (same as other functions).

---

## What Has Not Been Designed Yet

Everything above Layer 3 — entity discovery, relationships, intelligence — is not yet designed.

**Do not build anything beyond what is described in this file without explicit instruction.**
