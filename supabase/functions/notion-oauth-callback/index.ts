Deno.serve(async (req) => {
  const integration = "notion";
  const successUrl = `http://localhost:8080/connect?integration=${integration}&status=success`;
  const errorUrl = `http://localhost:8080/connect?integration=${integration}&status=error`;

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");

    // Verify state cookie
    const cookieHeader = req.headers.get("cookie") ?? "";
    const cookies = Object.fromEntries(
      cookieHeader.split(";").map((c) => {
        const [k, ...v] = c.trim().split("=");
        return [k, v.join("=")];
      })
    );
    if (!state || cookies["notion_oauth_state"] !== state) {
      return Response.redirect(errorUrl, 302);
    }

    if (!code) {
      return Response.redirect(errorUrl, 302);
    }

    const clientId = Deno.env.get("NOTION_CLIENT_ID")!;
    const clientSecret = Deno.env.get("NOTION_CLIENT_SECRET")!;
    const redirectUri = Deno.env.get("NOTION_REDIRECT_URI")!;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Exchange code for token — Notion uses HTTP Basic auth
    const tokenRes = await fetch("https://api.notion.com/v1/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
        "Notion-Version": "2022-06-28",
      },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenRes.ok) {
      return Response.redirect(errorUrl, 302);
    }

    const tokenData = await tokenRes.json();

    // Notion's token response includes workspace metadata — no second API call needed
    const accessToken: string = tokenData.access_token;
    const workspaceId: string | null = tokenData.workspace_id ?? null;
    const workspaceName: string | null = tokenData.workspace_name ?? null;
    const workspaceIconUrl: string | null = tokenData.workspace_icon ?? null;
    const botId: string | null = tokenData.bot_id ?? null;
    const ownerName: string | null =
      tokenData.owner?.person?.name ?? tokenData.owner?.user?.name ?? null;
    const ownerEmail: string | null =
      tokenData.owner?.person?.email ??
      tokenData.owner?.user?.person?.email ??
      null;
    const isTeamWorkspace: boolean =
      tokenData.owner?.type === "workspace" || false;

    // Upsert into connections_notion
    const upsertRes = await fetch(
      `${supabaseUrl}/rest/v1/connections_notion`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseServiceKey}`,
          apikey: supabaseServiceKey,
          Prefer: "resolution=merge-duplicates",
        },
        body: JSON.stringify({
          owner_id: "default",
          workspace_id: workspaceId,
          workspace_name: workspaceName,
          workspace_icon_url: workspaceIconUrl,
          bot_id: botId,
          owner_name: ownerName,
          owner_email: ownerEmail,
          is_team_workspace: isTeamWorkspace,
          access_token: accessToken,
          connected_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
      }
    );

    if (!upsertRes.ok) {
      return Response.redirect(errorUrl, 302);
    }

    return Response.redirect(successUrl, 302);
  } catch {
    return Response.redirect(errorUrl, 302);
  }
});
