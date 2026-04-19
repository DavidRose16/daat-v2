const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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
  const workspaceId: string | undefined = profile?.workspace_id;
  if (!workspaceId) {
    return new Response(JSON.stringify({ error: "Workspace not found" }), {
      status: 403, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  try {
    // 1. Read connection
    const connRes = await fetch(
      `${supabaseUrl}/rest/v1/connections_slack?owner_id=eq.${workspaceId}&limit=1`,
      { headers: sbHeaders },
    );
    if (!connRes.ok) throw new Error("Failed to read Slack connection");
    const [conn] = await connRes.json();
    if (!conn) {
      return new Response(
        JSON.stringify({ error: "No Slack connection found" }),
        { status: 404, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const accessToken: string = conn.access_token;
    const slackHeaders = { Authorization: `Bearer ${accessToken}` };

    let totalIngested = 0;
    let totalErrors = 0;
    const seenIds = new Set<string>();
    const fetchedChannelIds = new Set<string>();

    // 2. List public and private channels
    const channels: Array<{ id: string; name: string; isPrivate: boolean }> =
      [];
    let channelCursor: string | undefined;
    do {
      const params = new URLSearchParams({
        types: "public_channel,private_channel",
        limit: "200",
        exclude_archived: "true",
      });
      if (channelCursor) params.set("cursor", channelCursor);
      const chanRes = await fetch(
        `https://slack.com/api/conversations.list?${params}`,
        { headers: slackHeaders },
      );
      if (!chanRes.ok) break;
      const chanData = await chanRes.json();
      if (!chanData.ok) break;
      for (const ch of chanData.channels ?? []) {
        channels.push({
          id: ch.id,
          name: ch.name ?? "",
          isPrivate: ch.is_private ?? false,
        });
      }
      channelCursor =
        chanData.response_metadata?.next_cursor || undefined;
    } while (channelCursor);

    // 3. For each channel, fetch all messages and ingest
    for (const channel of channels) {
      const channelType = channel.isPrivate ? "private" : "public";
      let historyCursor: string | undefined;
      let channelFullyFetched = true;

      do {
        const params = new URLSearchParams({
          channel: channel.id,
          limit: "200",
        });
        if (historyCursor) params.set("cursor", historyCursor);
        const histRes = await fetch(
          `https://slack.com/api/conversations.history?${params}`,
          { headers: slackHeaders },
        );
        if (!histRes.ok) { channelFullyFetched = false; break; }
        const histData = await histRes.json();
        if (!histData.ok) { channelFullyFetched = false; break; } // e.g. not_in_channel

        for (const msg of histData.messages ?? []) {
          const ts: string = msg.ts;
          if (!ts) continue;

          // Skip reply messages that leaked into history (thread_ts !== ts)
          if (msg.thread_ts && msg.thread_ts !== ts) continue;

          const sourceRecordId = `${channel.id}:${ts}`;
          seenIds.add(sourceRecordId);
          const replyCount: number = msg.reply_count ?? 0;
          const isThread = replyCount > 0;
          const sentAt = new Date(parseFloat(ts) * 1000).toISOString();
          const lastReplyAt = msg.latest_reply
            ? new Date(parseFloat(msg.latest_reply) * 1000).toISOString()
            : null;

          let rawContent: Record<string, unknown>;
          let messageCount: number;
          let participantCount: number;
          let hasReactions: boolean;
          let reactionCount: number;
          let mentionCount: number;

          if (isThread) {
            // Fetch full thread
            const threadMessages: Record<string, unknown>[] = [];
            let threadCursor: string | undefined;
            do {
              const tp = new URLSearchParams({
                channel: channel.id,
                ts,
                limit: "200",
              });
              if (threadCursor) tp.set("cursor", threadCursor);
              const threadRes = await fetch(
                `https://slack.com/api/conversations.replies?${tp}`,
                { headers: slackHeaders },
              );
              if (!threadRes.ok) break;
              const threadData = await threadRes.json();
              if (!threadData.ok) break;
              for (const m of threadData.messages ?? []) {
                threadMessages.push(m);
              }
              threadCursor =
                threadData.response_metadata?.next_cursor || undefined;
            } while (threadCursor);

            rawContent = {
              channel_id: channel.id,
              thread_ts: ts,
              messages: threadMessages,
            };
            messageCount = threadMessages.length;

            const participantIds = new Set<string>();
            let totalReactions = 0;
            let anyReactions = false;
            let totalMentions = 0;
            for (const m of threadMessages) {
              if (m.user) participantIds.add(m.user as string);
              for (
                const r of (m.reactions as Array<{ count: number }> | null) ??
                  []
              ) {
                totalReactions += r.count ?? 0;
                anyReactions = true;
              }
              totalMentions += countMentions(m.text as string | null);
            }
            participantCount = participantIds.size;
            hasReactions = anyReactions;
            reactionCount = totalReactions;
            mentionCount = totalMentions;
          } else {
            rawContent = {
              channel_id: channel.id,
              thread_ts: ts,
              messages: [msg],
            };
            messageCount = 1;
            participantCount = msg.user ? 1 : 0;
            const reactions =
              (msg.reactions as Array<{ count: number }> | null) ?? [];
            hasReactions = reactions.length > 0;
            reactionCount = reactions.reduce(
              (sum: number, r: { count: number }) => sum + (r.count ?? 0),
              0,
            );
            mentionCount = countMentions(msg.text as string | null);
          }

          const rpcRes = await fetch(
            `${supabaseUrl}/rest/v1/rpc/ingest_slack_signal`,
            {
              method: "POST",
              headers: sbHeaders,
              body: JSON.stringify({
                p_owner_id: workspaceId,
                p_source_record_id: sourceRecordId,
                p_raw_content: rawContent,
                p_channel_id: channel.id,
                p_channel_name: channel.name,
                p_channel_type: channelType,
                p_thread_ts: ts,
                p_is_thread: isThread,
                p_message_count: messageCount,
                p_participant_count: participantCount,
                p_sender_id: (msg.user as string | null) ?? null,
                p_sent_at: sentAt,
                p_last_reply_at: lastReplyAt,
                p_has_reactions: hasReactions,
                p_reaction_count: reactionCount,
                p_mention_count: mentionCount,
              }),
            },
          );
          if (rpcRes.ok) {
            totalIngested++;
          } else {
            totalErrors++;
          }
        }

        historyCursor =
          histData.response_metadata?.next_cursor || undefined;
      } while (historyCursor);

      if (channelFullyFetched) fetchedChannelIds.add(channel.id);
    }

    // 4. Reconcile: delete signals from fetched channels that no longer exist
    const reconcileRes = await fetch(
      `${supabaseUrl}/rest/v1/rpc/reconcile_slack_signals`,
      {
        method: "POST",
        headers: sbHeaders,
        body: JSON.stringify({
          p_owner_id: workspaceId,
          p_seen_ids: Array.from(seenIds),
          p_fetched_channel_ids: Array.from(fetchedChannelIds),
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

function countMentions(text: string | null): number {
  if (!text) return 0;
  return (text.match(/<@U[A-Z0-9]+>/g) ?? []).length;
}
