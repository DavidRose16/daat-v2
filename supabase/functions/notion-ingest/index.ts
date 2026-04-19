const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── Types ──────────────────────────────────────────────────────────────────────

interface NotionPage {
  id: string;
  parent: { type: string; page_id?: string; database_id?: string };
  properties: Record<string, unknown>;
  icon: unknown;
  cover: unknown;
  created_time: string;
  last_edited_time: string;
  created_by: { id: string };
  last_edited_by: { id: string };
}

interface NotionDatabase {
  id: string;
  title: Array<{ plain_text: string }>;
}

interface IngestContext {
  parentPageId: string | null;
  breadcrumb: string[];
  depth: number;
  isDatabaseEntry: boolean;
  databaseId: string;
  databaseTitle: string;
}

// ── Notion API helpers ─────────────────────────────────────────────────────────

async function searchAll(
  filter: Record<string, unknown>,
  notionHeaders: Record<string, string>,
): Promise<unknown[]> {
  const results: unknown[] = [];
  let startCursor: string | undefined;
  do {
    const body: Record<string, unknown> = { filter, page_size: 100 };
    if (startCursor) body.start_cursor = startCursor;
    const res = await fetch("https://api.notion.com/v1/search", {
      method: "POST",
      headers: notionHeaders,
      body: JSON.stringify(body),
    });
    if (!res.ok) break;
    const data = await res.json();
    for (const item of data.results ?? []) results.push(item);
    startCursor = data.has_more ? data.next_cursor : undefined;
  } while (startCursor);
  return results;
}

async function queryDatabase(
  databaseId: string,
  notionHeaders: Record<string, string>,
): Promise<NotionPage[]> {
  const pages: NotionPage[] = [];
  let startCursor: string | undefined;
  do {
    const body: Record<string, unknown> = { page_size: 100 };
    if (startCursor) body.start_cursor = startCursor;
    const res = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
      method: "POST",
      headers: notionHeaders,
      body: JSON.stringify(body),
    });
    if (!res.ok) break;
    const data = await res.json();
    for (const page of data.results ?? []) pages.push(page as NotionPage);
    startCursor = data.has_more ? data.next_cursor : undefined;
  } while (startCursor);
  return pages;
}

async function fetchBlocks(
  pageId: string,
  notionHeaders: Record<string, string>,
): Promise<Record<string, unknown>[]> {
  const blocks: Record<string, unknown>[] = [];
  let cursor: string | undefined;
  do {
    const params = new URLSearchParams({ page_size: "100" });
    if (cursor) params.set("start_cursor", cursor);
    const res = await fetch(
      `https://api.notion.com/v1/blocks/${pageId}/children?${params}`,
      { headers: notionHeaders },
    );
    if (!res.ok) break;
    const data = await res.json();
    for (const block of data.results ?? []) blocks.push(block as Record<string, unknown>);
    cursor = data.next_cursor ?? undefined;
  } while (cursor);
  return blocks;
}

async function fetchPage(
  pageId: string,
  notionHeaders: Record<string, string>,
): Promise<NotionPage | null> {
  const res = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    headers: notionHeaders,
  });
  if (!res.ok) return null;
  return await res.json() as NotionPage;
}

// ── Metadata helpers ───────────────────────────────────────────────────────────

function extractTitle(page: NotionPage): string {
  const props = page.properties ?? {};
  for (const prop of Object.values(props)) {
    const p = prop as Record<string, unknown>;
    if (p.type === "title") {
      const segments = (p.title as Array<{ plain_text?: string }>) ?? [];
      const text = segments.map((s) => s.plain_text ?? "").join("").trim();
      if (text) return text;
    }
  }
  return "Untitled";
}

function extractPageIcon(page: NotionPage): string | null {
  const icon = (page.icon as Record<string, unknown> | null) ?? {};
  if (icon.type === "emoji") return (icon.emoji as string | null) ?? null;
  if (icon.type === "external") return ((icon.external as Record<string, unknown>)?.url as string | null) ?? null;
  if (icon.type === "file") return ((icon.file as Record<string, unknown>)?.url as string | null) ?? null;
  return null;
}

const ATTACHMENT_TYPES = new Set(["image", "file", "video", "pdf", "audio"]);
const RICH_TEXT_BLOCK_TYPES = new Set([
  "paragraph", "heading_1", "heading_2", "heading_3",
  "bulleted_list_item", "numbered_list_item", "toggle", "quote", "callout",
]);

function analyzeBlocks(blocks: Record<string, unknown>[]) {
  let childCount = 0;
  let hasAttachments = false;
  let internalLinkCount = 0;

  for (const block of blocks) {
    const type = block.type as string;
    if (type === "child_page") childCount++;
    if (ATTACHMENT_TYPES.has(type)) hasAttachments = true;
    if (type === "link_to_page") internalLinkCount++;
    if (RICH_TEXT_BLOCK_TYPES.has(type)) {
      const blockData = (block[type] as Record<string, unknown> | null) ?? {};
      const richText = (blockData.rich_text as Record<string, unknown>[] | null) ?? [];
      for (const rt of richText) {
        if (rt.type === "mention") {
          const mention = (rt.mention as Record<string, unknown> | null) ?? {};
          if (mention.type === "page") internalLinkCount++;
        }
      }
    }
  }

  return { blockCount: blocks.length, childCount, hasAttachments, internalLinkCount };
}

// ── Main handler ───────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  const sbHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${supabaseServiceKey}`,
    apikey: supabaseServiceKey,
  };

  // Verify JWT and resolve workspace
  const authHeader = req.headers.get("Authorization") ?? "";
  const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: authHeader, apikey: supabaseAnonKey },
  });
  if (!userRes.ok) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
  const { id: userId } = await userRes.json();
  const profileRes = await fetch(
    `${supabaseUrl}/rest/v1/profiles?user_id=eq.${userId}&select=workspace_id&limit=1`,
    { headers: sbHeaders },
  );
  const [profile] = await profileRes.json();
  const ownerWorkspaceId: string | undefined = profile?.workspace_id;
  if (!ownerWorkspaceId) {
    return new Response(JSON.stringify({ error: "Workspace not found" }), {
      status: 403, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  try {
    // 1. Read connection
    const connRes = await fetch(
      `${supabaseUrl}/rest/v1/connections_notion?owner_id=eq.${ownerWorkspaceId}&limit=1`,
      { headers: sbHeaders },
    );
    if (!connRes.ok) throw new Error("Failed to read Notion connection");
    const [conn] = await connRes.json();
    if (!conn) {
      return new Response(
        JSON.stringify({ error: "No Notion connection found" }),
        { status: 404, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const accessToken: string = conn.access_token;
    const notionWorkspaceId: string | null = conn.workspace_id ?? null;

    const notionHeaders = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      "Notion-Version": "2022-06-28",
    };

    let totalIngested = 0;
    let totalErrors = 0;
    const seenIds = new Set<string>();

    // ── ingestPage ──────────────────────────────────────────────────────────────

    async function ingestPage(page: NotionPage, ctx: IngestContext): Promise<void> {
      if (seenIds.has(page.id)) return;
      seenIds.add(page.id);

      let blocks: Record<string, unknown>[] = [];
      try {
        blocks = await fetchBlocks(page.id, notionHeaders);
      } catch (_) {
        // proceed with empty blocks — still ingest the page
      }

      const { blockCount, childCount, hasAttachments, internalLinkCount } = analyzeBlocks(blocks);

      const pageIcon = extractPageIcon(page);
      const hasCover = page.cover !== null && page.cover !== undefined;
      const createdBy = page.created_by?.id ?? null;
      const lastEditedBy = page.last_edited_by?.id ?? null;
      const createdAtSource = page.created_time ?? null;
      const lastEditedAtSource = page.last_edited_time ?? null;

      const rawContent = { page, blocks };

      const rpcRes = await fetch(`${supabaseUrl}/rest/v1/rpc/ingest_notion_signal`, {
        method: "POST",
        headers: sbHeaders,
        body: JSON.stringify({
          p_owner_id:              ownerWorkspaceId,
          p_source_record_id:      page.id,
          p_raw_content:           rawContent,
          p_parent_page_id:        ctx.parentPageId,
          p_workspace_id:          notionWorkspaceId,
          p_page_type:             page.parent.type,
          p_page_icon:             pageIcon,
          p_has_cover:             hasCover,
          p_has_attachments:       hasAttachments,
          p_internal_link_count:   internalLinkCount,
          p_block_count:           blockCount,
          p_child_count:           childCount,
          p_last_edited_by:        lastEditedBy,
          p_created_by:            createdBy,
          p_created_at_source:     createdAtSource,
          p_last_edited_at_source: lastEditedAtSource,
          p_is_database_entry:     ctx.isDatabaseEntry,
          p_database_id:           ctx.databaseId,
          p_breadcrumb:            ctx.breadcrumb,
          p_depth_level:           ctx.depth,
          p_database_title:        ctx.databaseTitle,
          p_teamspace_id:          null,
          p_teamspace_name:        null,
        }),
      });

      if (rpcRes.ok) {
        totalIngested++;
      } else {
        totalErrors++;
        const errBody = await rpcRes.text().catch(() => "");
        console.log(JSON.stringify({ reason: "rpc_failed", page_id: page.id, error: errBody }));
        return; // don't recurse on failed pages
      }

      // Recurse into child pages
      for (const block of blocks) {
        if (block.type !== "child_page") continue;
        const blockId = block.id as string;
        // Use title from block if available, fall back to fetching full page
        const blockTitle = ((block.child_page as Record<string, unknown>)?.title as string | null) ?? null;

        let childPage: NotionPage | null = null;
        try {
          childPage = await fetchPage(blockId, notionHeaders);
        } catch (_) {
          totalErrors++;
          continue;
        }
        if (!childPage) { totalErrors++; continue; }

        const childTitle = blockTitle || extractTitle(childPage);

        await ingestPage(childPage, {
          parentPageId:   page.id,
          breadcrumb:     [...ctx.breadcrumb, childTitle],
          depth:          ctx.depth + 1,
          isDatabaseEntry: false,
          databaseId:     ctx.databaseId,
          databaseTitle:  ctx.databaseTitle,
        });
      }
    }

    // 2. Find all databases
    const databases = await searchAll(
      { value: "database", property: "object" },
      notionHeaders,
    ) as NotionDatabase[];

    // 3. For each database, ingest all its pages recursively
    for (const database of databases) {
      const databaseTitle = (database.title ?? [])
        .map((t) => t.plain_text ?? "")
        .join("")
        .trim() || "Untitled Database";

      let pages: NotionPage[] = [];
      try {
        pages = await queryDatabase(database.id, notionHeaders);
      } catch (_) {
        totalErrors++;
        continue;
      }

      for (const page of pages) {
        const pageTitle = extractTitle(page);
        await ingestPage(page, {
          parentPageId:    null,
          breadcrumb:      [databaseTitle, pageTitle],
          depth:           1,
          isDatabaseEntry: true,
          databaseId:      database.id,
          databaseTitle:   databaseTitle,
        });
      }
    }

    // 4. Reconcile: delete signals for Notion pages no longer found
    const reconcileRes = await fetch(`${supabaseUrl}/rest/v1/rpc/reconcile_signals`, {
      method: "POST",
      headers: sbHeaders,
      body: JSON.stringify({
        p_source:   "notion",
        p_owner_id: ownerWorkspaceId,
        p_seen_ids: Array.from(seenIds),
      }),
    });
    const deleted = reconcileRes.ok ? await reconcileRes.json() : null;

    return new Response(
      JSON.stringify({ ingested: totalIngested, errors: totalErrors, deleted }),
      { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }
});
