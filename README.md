# DAAT v2 — Organizational Intelligence Platform

DAAT reconstructs organizational context from fragmented company data. It ingests raw data from Slack, Notion, QuickBooks, and Google Workspace, transforms it into a universal signal representation, and then uses Claude to extract grounded, structured intelligence from each signal — capturing workflows, decisions, problems, tools, people, and states, all traced back to source.

The design goal: build something that makes implicit organizational knowledge explicit, without distorting or hallucinating it.

---

## Architecture

DAAT is built on a layered database architecture where each layer adds depth without destroying what came before. Layers are transparent and auditable — every comprehension can be traced back to the raw API payload that produced it.

```
Layer 0 — Connections     OAuth credentials and workspace metadata per integration
Layer 1 — Signals         Universal representation of every data item from every source
Layer 2 — Comprehension   Claude-generated structured extraction from each signal
Layer 3+ — (not yet built) Entity discovery, relationship synthesis, org intelligence
```

---

## Stack

| Layer | Technology |
|---|---|
| Database | Supabase (PostgreSQL) |
| Backend | Deno TypeScript, deployed as Supabase Edge Functions |
| AI | Claude Sonnet via Anthropic API |
| Frontend | Vanilla HTML/CSS/JS — no framework |
| Deployment | Vercel (frontend), Supabase (functions + database) |
| Integrations | Slack, Notion, QuickBooks, Google Workspace |

---

## Database Schema

### Layer 0 — Connections

Four tables, one per integration: `connections_slack`, `connections_notion`, `connections_quickbooks`, `connections_google`. Each stores OAuth tokens, token expiry, and workspace/company metadata (name, domain, IDs). All have `owner_id` for multi-tenancy and RLS enabled.

### Layer 1 — Signals

The universal spine. Every piece of data from every source gets a row in `signals_core`:

| Column | Description |
|---|---|
| `id` | uuid PK |
| `owner_id` | multi-tenant owner (defaults to `'default'`) |
| `source` | `quickbooks` · `google_workspace` · `slack` · `notion` |
| `content_archetype` | `financial` · `access` · `conversational` · `documentation` |
| `source_record_id` | native ID from the source system |
| `raw_content` | JSONB — unmodified API payload |
| `processing_status` | `ingested` → `enriched` |
| `ingested_at` | when raw_content was populated |
| `enriched_at` | when structural enrichment completed |

Each source also has a dedicated table (`signals_slack`, `signals_notion`, `signals_quickbooks`, `signals_google`) holding structural metadata extracted during ingest. These join back to `signals_core` via `signal_id` with cascade delete.

**The write pattern is enforced without exception:**
1. Insert into `signals_core` first → capture `id`
2. Insert into the source-specific table using that `id` as `signal_id`
3. Both inserts are atomic — if either fails, both roll back

Source-specific fields include:

- **Slack**: `channel_id`, `channel_name`, `channel_type`, `thread_ts`, `message_count`, `participant_count`, `sender_id`, `reaction_count`, `mention_count`
- **Notion**: `page_id`, `parent_page_id`, `database_id`, `breadcrumb`, `depth_level`, `block_count`, `child_count`, `has_attachments`, `internal_link_count`, `created_by`, `last_edited_by`
- **QuickBooks**: `vendor_name`, `vendor_id`, `amount`, `currency`, `transaction_date`, `transaction_type`, `category`, `payment_method`, `account_name`, `class_name`, `tax_amount`, `is_billable`
- **Google**: `app_id`, `app_name`, `scopes`, `user_ids`, `user_count`

### Layer 2 — Comprehension

One table: `comprehensions_assembly`. One row per signal, enforced by unique constraint on `signal_id`.

| Column | Description |
|---|---|
| `signal_id` | FK → `signals_core(id)`, unique, cascade delete |
| `comprehension` | JSONB — Claude's structured extraction |
| `status` | `pending` → `processing` → `completed` · `failed` |
| `model` | which Claude model produced it |
| `produced_at` | when Claude ran |

The comprehension JSONB follows a versioned schema (v1):

```json
{
  "signal_purpose": "short groupable phrase",
  "context": {
    "source": "slack | notion | quickbooks | google",
    "primary_label": "main identifier",
    "secondary": "optional context"
  },
  "workflows":  [{ "label": "...", "grounding": "quote or reference" }],
  "problems":   [{ "label": "...", "grounding": "..." }],
  "tools":      [{ "label": "...", "grounding": "..." }],
  "decisions":  [{ "label": "...", "grounding": "..." }],
  "people":     [{ "label": "...", "grounding": "..." }],
  "states":     [{ "label": "...", "grounding": "..." }],
  "summary":    "narrative description of what the signal contains",
  "uncertainty": "what could not be determined from this signal alone",
  "tacit":       "implied context not explicitly stated"
}
```

Every extraction is grounded — each `label` is paired with a `grounding` field that quotes or references the source data that supports it. This makes the comprehension auditable and prevents hallucination from compounding across layers.

---

## Edge Functions

### `slack-ingest`

- Lists all channels (public + private, excluding archived)
- Fetches all messages per channel; fetches full threads for messages with replies
- Creates one signal per message/thread with `source_record_id = {channel_id}:{thread_ts}`
- Extracts participant counts, reaction counts, mention counts into `signals_slack`
- Reconciles on every run: deletes signals for messages no longer present in Slack

### `notion-ingest`

- Searches workspace for all databases
- For each database, queries all entries and recursively fetches child pages
- Extracts block structure (paragraphs, headings, lists, embeds, attachments, internal links)
- Tracks full hierarchy: `breadcrumb`, `depth_level`, `parent_page_id`, `database_id`
- Reconciles on every run

### `quickbooks-ingest`

- Queries Purchase, Bill, and Invoice entities via QuickBooks Query API
- Paginated (1000 results per request)
- Normalizes vendor/customer info, payment method, account, category, class across entity types
- `source_record_id = {EntityType}:{Id}` (e.g., `Purchase:123`)
- Handles OAuth token refresh automatically if token is within 60s of expiry

### `google-ingest`

- Lists all users via Google Admin Directory API
- For each user, fetches third-party OAuth tokens they've authorized
- Aggregates by client ID (one signal per unique app across all users)
- Extracts app name, scopes, and full list of user IDs who authorized
- Reconciles on every run

### `comprehend`

- Fetches pending rows from `comprehensions_assembly`
- For each, joins `signals_core` + source-specific table to build full context
- Calls Claude Sonnet with a system prompt (comprehension doctrine) + source-specific prompt + signal data
- Validates response JSON against schema; logs specific validation failures
- Writes result back to `comprehensions_assembly`
- 2s delay between Anthropic API calls for rate limiting
- Returns `{ succeeded, failed, skipped, errors }` with per-signal error details

### OAuth Functions (×4)

Each integration has a `{source}-oauth-start` and `{source}-oauth-callback` function:

- **Start**: Generates a random state UUID, sets it as an HttpOnly cookie, redirects to the platform's OAuth endpoint with appropriate scopes
- **Callback**: Validates state cookie, exchanges code for tokens, fetches workspace/company metadata, upserts into the connection table, redirects to the admin dashboard

---

## Comprehension Doctrine

The `comprehend` function is driven by a versioned doctrine that defines what Claude is and is not allowed to extract.

**Allowed:**
- Facts plainly stated in the signal
- Local inferences grounded in content of that signal alone
- Honest uncertainty (null over weak inference)
- Tacit context — things implied but not said

**Forbidden:**
- Cross-signal synthesis (no claims about patterns across signals)
- Organizational-level assertions not grounded in this signal
- Guessing when evidence is absent

Source type shapes what categories surface:
- **Slack**: work in motion, friction, implicit decisions, tone
- **Notion**: intended workflows, documented decisions, gaps, staleness signals
- **QuickBooks**: vendor relationships, spend patterns, workflow positions
- **Google**: app usage patterns, authorization breadth, security-relevant scope grants

---

## Frontend

Three single-page UIs with no framework — direct Supabase REST API calls from the browser.

**Admin dashboard** (`index.html`): Connection status cards per integration with connect/disconnect/test-ingest controls. Pipeline status (completed, pending, stalled comprehensions). Signal counts by source and archetype with bar charts. "Run Comprehend" button with live result panel.

**Ingest explorer** (`daat-ingest.html`): Browse Layer 1 signals. Filter by source, processing status, search text. Per-signal cards showing source-specific metadata. Expandable raw content JSON. Live mode polls every 5s and highlights new arrivals.

**Comprehension explorer** (`daat-explorer.html`): Browse Layer 2 comprehensions. Same filtering. Cards show the full structured extraction — all categories, grounding quotes, summary, uncertainty, and tacit context inline.

---

## Data Flow

```
User authorizes integration (OAuth)
  → credentials stored in Layer 0 (connections_*)

Admin triggers ingest
  → edge function fetches from source API
  → for each item: insert signals_core + signals_{source} atomically
  → comprehensions_assembly row created with status='pending'
  → reconciliation deletes stale signals

Admin triggers comprehend
  → fetches pending comprehensions
  → for each: join signals_core + signals_{source}
  → build prompt: doctrine + source-specific guidance + signal data
  → call Claude → validate JSON → write to comprehensions_assembly
  → status updated to 'completed' or 'failed'
```

---

## Project Structure

```
daat-v2/
├── supabase/functions/
│   ├── comprehend/
│   ├── slack-ingest/       slack-oauth-start/   slack-oauth-callback/
│   ├── notion-ingest/      notion-oauth-start/  notion-oauth-callback/
│   ├── quickbooks-ingest/  quickbooks-oauth-start/  quickbooks-oauth-callback/
│   └── google-ingest/      google-oauth-start/  google-oauth-callback/
├── docs/layers/
│   └── layer-2-comprehension.md    comprehension doctrine + JSONB schema
├── index.html              admin dashboard
├── daat-ingest.html        Layer 1 signal explorer
├── daat-explorer.html      Layer 2 comprehension explorer
├── CLAUDE.md               architecture reference
└── vercel.json
```

---

## What's Not Built Yet

- **Layer 3+**: Entity discovery, relationship synthesis, organizational intelligence
- **Authentication**: Current build assumes single tenant (`owner_id = 'default'`)
- **Webhooks**: Ingest is triggered manually, not event-driven
- **Feedback loop**: No UI for reviewing or correcting comprehensions
