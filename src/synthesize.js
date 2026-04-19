import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../.env') });

// ============================================================
// Layer 1 — Retrieval
//
// Queries comprehensions_output for rows relevant to the query.
// Matches entity names (case-insensitive) against labels in the
// people, workflows, decisions, and problems JSONB fields.
// Orders by recency and returns at most 20 rows.
// ============================================================

export async function retrieveComprehensions({ task, entities = [] }) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const workspaceId = process.env.DAAT_WORKSPACE_ID;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase credentials. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env');
  }
  if (!workspaceId) {
    throw new Error('Missing DAAT_WORKSPACE_ID in .env');
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data, error } = await supabase
    .from('comprehensions_output')
    .select('id, signal_id, owner_id, comprehension, model, comprehended_at, created_at')
    .eq('owner_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) throw new Error(`Supabase query failed: ${error.message}`);

  console.log(`[retrieve] fetched ${data.length} rows from comprehensions_output`);

  if (entities.length === 0) {
    const result = data.slice(0, 20);
    console.log(`[retrieve] no entities specified — returning ${result.length} most recent rows`);
    return result;
  }

  const terms = entities.map(e => e.toLowerCase());
  const ENTITY_FIELDS = ['people', 'workflows', 'decisions', 'problems'];

  const matched = data.filter(row => {
    const c = row.comprehension;
    if (!c) return false;

    for (const field of ENTITY_FIELDS) {
      if (Array.isArray(c[field])) {
        for (const item of c[field]) {
          if (item?.label && terms.some(t => item.label.toLowerCase().includes(t))) return true;
        }
      }
    }

    // Also check signal_purpose and summary for broader coverage
    if (c.signal_purpose && terms.some(t => c.signal_purpose.toLowerCase().includes(t))) return true;
    if (c.summary && terms.some(t => c.summary.toLowerCase().includes(t))) return true;

    return false;
  });

  // If no entity matches found, fall back to most recent rows so synthesis still runs
  const result = (matched.length > 0 ? matched : data).slice(0, 20);

  console.log(`[retrieve] entity match: ${matched.length} rows matched, returning ${result.length}`);
  if (matched.length > 0) {
    console.log(`[retrieve] signal purposes:`, result.map(r => r.comprehension?.signal_purpose).filter(Boolean));
  } else {
    console.log(`[retrieve] no entity matches — falling back to ${result.length} most recent rows`);
  }

  return result;
}

// ============================================================
// Layer 2 — Synthesis
//
// Loads the synthesis doctrine, passes retrieved comprehensions
// and the original query to Claude, and returns structured JSON.
// Uses prompt caching on the doctrine (stable across requests).
// ============================================================

export async function synthesize(query, comprehensions) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('Missing ANTHROPIC_API_KEY in .env');

  const doctrinePath = join(__dirname, '../docs/layers/synthesis-doctrine.md');
  const doctrine = readFileSync(doctrinePath, 'utf-8');

  const client = new Anthropic({ apiKey });

  const userMessage =
    `QUERY:\n${JSON.stringify(query, null, 2)}\n\n` +
    `COMPREHENSIONS (${comprehensions.length} rows):\n` +
    JSON.stringify(
      comprehensions.map(r => ({
        signal_id: r.signal_id,
        comprehended_at: r.comprehended_at,
        comprehension: r.comprehension,
      })),
      null,
      2
    ) +
    `\n\nReturn a JSON object following the synthesis doctrine output format exactly. Do not include any text outside the JSON object.`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: [
      {
        type: 'text',
        text: doctrine,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: userMessage }],
  });

  console.log(
    `[synthesize] model=${response.model}`,
    `input=${response.usage.input_tokens}`,
    `output=${response.usage.output_tokens}`,
    `cache_read=${response.usage.cache_read_input_tokens ?? 0}`,
    `cache_write=${response.usage.cache_creation_input_tokens ?? 0}`
  );

  const rawText = response.content[0].text;
  const jsonText = rawText.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();

  return JSON.parse(jsonText);
}

// ============================================================
// Main — test harness
// Run with: node src/synthesize.js
// ============================================================

async function main() {
  const testQuery = {
    task: 'Understanding what is currently broken or blocked in the product, and who owns it',
    entities: ['product', 'slack', 'connection', 'issue'],
  };

  console.log('\n=== DAAT Synthesis Test ===');
  console.log('Query:', JSON.stringify(testQuery, null, 2));

  console.log('\n--- Layer 1: Retrieval ---');
  const rows = await retrieveComprehensions(testQuery);
  console.log(`Retrieved ${rows.length} rows\n`);

  if (rows.length === 0) {
    console.log('No rows retrieved. Check that comprehensions_output has data.');
    return;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('ANTHROPIC_API_KEY not set — skipping synthesis call.');
    console.log('Add ANTHROPIC_API_KEY to .env to run the full test.');
    return;
  }

  console.log('--- Layer 2: Synthesis ---');
  const result = await synthesize(testQuery, rows);
  console.log('\nSynthesis result:');
  console.log(JSON.stringify(result, null, 2));
}

const isMain = resolve(process.argv[1]) === __filename;
if (isMain) {
  main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}
