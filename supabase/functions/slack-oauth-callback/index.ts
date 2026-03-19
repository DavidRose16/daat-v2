Deno.serve(async (req) => {
  const integration = "slack";
  const successUrl = `https://daatview.com?integration=${integration}&status=success`;
  const errorUrl = `https://daatview.com?integration=${integration}&status=error`;

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
    if (!state || cookies["slack_oauth_state"] !== state) {
      return Response.redirect(errorUrl, 302);
    }

    if (!code) {
      return Response.redirect(errorUrl, 302);
    }

    const clientId = Deno.env.get("SLACK_CLIENT_ID")!;
    const clientSecret = Deno.env.get("SLACK_CLIENT_SECRET")!;
    const redirectUri = "https://wkimwkhysvvkrujsefyv.supabase.co/functions/v1/slack-oauth-callback";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Exchange code for tokens
    const tokenRes = await fetch("https://slack.com/api/oauth.v2.access", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenRes.ok) {
      return Response.redirect(errorUrl, 302);
    }

    const tokenData = await tokenRes.json();
    if (!tokenData.ok) {
      return Response.redirect(errorUrl, 302);
    }

    const accessToken: string = tokenData.access_token;

    // Fetch workspace info
    const teamRes = await fetch("https://slack.com/api/team.info", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    let teamId: string | null = null;
    let workspaceName: string | null = null;
    let workspaceDomain: string | null = null;
    let workspaceIconUrl: string | null = null;
    let isPaidPlan: boolean = false;
    let workspaceCreatedAt: string | null = null;

    if (teamRes.ok) {
      const teamData = await teamRes.json();
      if (teamData.ok) {
        const team = teamData.team;
        teamId = team.id ?? null;
        workspaceName = team.name ?? null;
        workspaceDomain = team.domain ?? null;
        workspaceIconUrl = team.icon?.image_132 ?? null;
        isPaidPlan = team.plan !== "" && team.plan !== "free";
        workspaceCreatedAt = team.created
          ? new Date(team.created * 1000).toISOString()
          : null;
      }
    }

    // Upsert into connections_slack
    const upsertRes = await fetch(`${supabaseUrl}/rest/v1/connections_slack`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseServiceKey}`,
        apikey: supabaseServiceKey,
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify({
        owner_id: "default",
        team_id: teamId,
        workspace_name: workspaceName,
        workspace_domain: workspaceDomain,
        workspace_icon_url: workspaceIconUrl,
        is_paid_plan: isPaidPlan,
        workspace_created_at: workspaceCreatedAt,
        access_token: accessToken,
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
    });

    if (!upsertRes.ok) {
      return Response.redirect(errorUrl, 302);
    }

    return Response.redirect(successUrl, 302);
  } catch {
    return Response.redirect(errorUrl, 302);
  }
});
