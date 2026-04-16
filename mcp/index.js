#!/usr/bin/env node

/**
 * DAAT MCP Server
 *
 * Exposes one tool — query_daat — that calls the DAAT synthesis
 * endpoint and returns structured organizational context.
 *
 * Configure in claude_desktop_config.json or equivalent:
 *   {
 *     "mcpServers": {
 *       "daat": {
 *         "command": "node",
 *         "args": ["/path/to/daat-v2/mcp/index.js"]
 *       }
 *     }
 *   }
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

const SYNTHESIZE_URL =
  process.env.DAAT_SYNTHESIZE_URL ||
  'https://wkimwkhysvvkrujsefyv.supabase.co/functions/v1/synthesize';

const SUPABASE_ANON_KEY =
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY;

// ============================================================
// Server setup
// ============================================================

const server = new McpServer({
  name: 'daat',
  version: '1.0.0',
});

// ============================================================
// Tool: query_daat
// ============================================================

server.tool(
  'query_daat',
  'Query DAAT for grounded organizational context. Retrieves and synthesizes relevant signal comprehensions from across the organization\'s connected tools (Slack, Notion, QuickBooks, Google Workspace). Returns a structured briefing with decisions, people, workflows, problems, and uncertainty.',
  {
    task: z.string().describe(
      'What the agent is trying to do. Be specific — this drives retrieval and synthesis.'
    ),
    entities: z.array(z.string()).describe(
      'Names of people, systems, workflows, or topics relevant to the query. Used for targeted retrieval.'
    ),
  },
  async ({ task, entities }) => {
    const headers = {
      'Content-Type': 'application/json',
    };

    if (SUPABASE_ANON_KEY) {
      headers['Authorization'] = `Bearer ${SUPABASE_ANON_KEY}`;
      headers['apikey'] = SUPABASE_ANON_KEY;
    }

    let response;
    try {
      response = await fetch(SYNTHESIZE_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({ task, entities }),
      });
    } catch (err) {
      return {
        content: [{
          type: 'text',
          text: `DAAT synthesis request failed: ${err.message}`,
        }],
        isError: true,
      };
    }

    const body = await response.text();

    if (!response.ok) {
      return {
        content: [{
          type: 'text',
          text: `DAAT synthesis returned ${response.status}: ${body}`,
        }],
        isError: true,
      };
    }

    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch {
      return {
        content: [{
          type: 'text',
          text: `DAAT synthesis returned non-JSON response: ${body.slice(0, 500)}`,
        }],
        isError: true,
      };
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(parsed, null, 2),
      }],
    };
  }
);

// ============================================================
// Start
// ============================================================

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('[daat-mcp] server running on stdio');
