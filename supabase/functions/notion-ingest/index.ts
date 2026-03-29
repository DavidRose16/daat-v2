const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const sbHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${supabaseServiceKey}`,
    apikey: supabaseServiceKey,
  };

  try {
    // 1. Read connection
    const connRes = await fetch(
      `${supabaseUrl}/rest/v1/connections_notion?owner_id=eq.default&limit=1`,
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
    const workspaceId: string | null = conn.workspace_id ?? null;

    const notionHeaders = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      "Notion-Version": "2022-06-28",
    };

    let totalIngested = 0;
    let totalErrors = 0;
    const seenIds = new Set<string>();

    // 2. Search all pages (paginated)
    let startCursor: string | undefined;
    do {
      const searchBody: Record<string, unknown> = {
        filter: { value: "page", property: "object" },
        page_size: 100,
      };
      if (startCursor) searchBody.start_cursor = startCursor;

      const searchRes = await fetch("https://api.notion.com/v1/search", {
        method: "POST",
        headers: notionHeaders,
        body: JSON.stringify(searchBody),
      });
      if (!searchRes.ok) break;
      const searchData = await searchRes.json();

      for (const page of searchData.results ?? []) {
        const parentType: string = page.parent?.type ?? "";

        // Skip database entries
        if (parentType === "database_id") continue;

        const pageId: string = page.id;
        seenIds.add(pageId);

        // 3. Fetch all blocks for this page (paginated)
        const allBlocks: Record<string, unknown>[] = [];
        let blockCursor: string | undefined;
        do {
          const blockParams = new URLSearchParams({ page_size: "100" });
          if (blockCursor) blockParams.set("start_cursor", blockCursor);
          const blocksRes = await fetch(
            `https://api.notion.com/v1/blocks/${pageId}/children?${blockParams}`,
            { headers: notionHeaders },
          );
          if (!blocksRes.ok) break;
          const blocksData = await blocksRes.json();
          for (const block of blocksData.results ?? []) {
            allBlocks.push(block);
          }
          blockCursor = blocksData.next_cursor ?? undefined;
        } while (blockCursor);

        // 4. Analyze blocks
        const { blockCount, childCount, hasAttachments, internalLinkCount } =
          analyzeBlocks(allBlocks);

        // 5. Map page metadata
        const icon = (page.icon as Record<string, unknown> | null) ?? {};
        const pageIcon =
          icon.type === "emoji"
            ? ((icon.emoji as string | null) ?? null)
            : icon.type === "external"
            ? (((icon.external as Record<string, unknown> | null)?.url as
                | string
                | null) ?? null)
            : icon.type === "file"
            ? (((icon.file as Record<string, unknown> | null)?.url as
                | string
                | null) ?? null)
            : null;

        const parentPageId =
          parentType === "page_id"
            ? ((page.parent?.page_id as string | null) ?? null)
            : null;

        const createdBy =
          (page.created_by?.id as string | null) ?? null;
        const lastEditedBy =
          (page.last_edited_by?.id as string | null) ?? null;
        const createdAtSource =
          (page.created_time as string | null) ?? null;
        const lastEditedAtSource =
          (page.last_edited_time as string | null) ?? null;
        const hasCover =
          page.cover !== null && page.cover !== undefined;

        const rawContent = { page, blocks: allBlocks };

        const rpcRes = await fetch(
          `${supabaseUrl}/rest/v1/rpc/ingest_notion_signal`,
          {
            method: "POST",
            headers: sbHeaders,
            body: JSON.stringify({
              p_owner_id: "default",
              p_source_record_id: pageId,
              p_raw_content: rawContent,
              p_parent_page_id: parentPageId,
              p_workspace_id: workspaceId,
              p_page_type: parentType,
              p_page_icon: pageIcon,
              p_has_cover: hasCover,
              p_has_attachments: hasAttachments,
              p_internal_link_count: internalLinkCount,
              p_block_count: blockCount,
              p_child_count: childCount,
              p_last_edited_by: lastEditedBy,
              p_created_by: createdBy,
              p_created_at_source: createdAtSource,
              p_last_edited_at_source: lastEditedAtSource,
            }),
          },
        );
        if (rpcRes.ok) {
          totalIngested++;
        } else {
          totalErrors++;
        }
      }

      startCursor = searchData.has_more ? searchData.next_cursor : undefined;
    } while (startCursor);

    // 3. Reconcile: delete signals no longer in Notion
    const reconcileRes = await fetch(
      `${supabaseUrl}/rest/v1/rpc/reconcile_signals`,
      {
        method: "POST",
        headers: sbHeaders,
        body: JSON.stringify({
          p_source: "notion",
          p_owner_id: "default",
          p_seen_ids: Array.from(seenIds),
        }),
      },
    );
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

const ATTACHMENT_TYPES = new Set(["image", "file", "video", "pdf", "audio"]);
const RICH_TEXT_BLOCK_TYPES = new Set([
  "paragraph",
  "heading_1",
  "heading_2",
  "heading_3",
  "bulleted_list_item",
  "numbered_list_item",
  "toggle",
  "quote",
  "callout",
]);

function analyzeBlocks(blocks: Record<string, unknown>[]) {
  const blockCount = blocks.length;
  let childCount = 0;
  let hasAttachments = false;
  let internalLinkCount = 0;

  for (const block of blocks) {
    const type = block.type as string;
    if (type === "child_page") childCount++;
    if (ATTACHMENT_TYPES.has(type)) hasAttachments = true;
    if (type === "link_to_page") internalLinkCount++;

    if (RICH_TEXT_BLOCK_TYPES.has(type)) {
      const blockData =
        (block[type] as Record<string, unknown> | null) ?? {};
      const richText =
        (blockData.rich_text as Record<string, unknown>[] | null) ?? [];
      for (const rt of richText) {
        if (rt.type === "mention") {
          const mention =
            (rt.mention as Record<string, unknown> | null) ?? {};
          if (mention.type === "page") internalLinkCount++;
        }
      }
    }
  }

  return { blockCount, childCount, hasAttachments, internalLinkCount };
}
