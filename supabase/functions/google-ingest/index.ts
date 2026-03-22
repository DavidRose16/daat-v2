Deno.serve(async (_req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const googleClientId = Deno.env.get("GOOGLE_CLIENT_ID")!;
  const googleClientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET")!;

  const sbHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${supabaseServiceKey}`,
    apikey: supabaseServiceKey,
  };

  try {
    // 1. Read connection
    const connRes = await fetch(
      `${supabaseUrl}/rest/v1/connections_google?owner_id=eq.default&limit=1`,
      { headers: sbHeaders },
    );
    if (!connRes.ok) throw new Error("Failed to read Google connection");
    const [conn] = await connRes.json();
    if (!conn) {
      return new Response(
        JSON.stringify({ error: "No Google connection found" }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }

    let accessToken: string = conn.access_token;

    // 2. Refresh token if expired or within 60 seconds of expiry
    const expiresAt = conn.token_expires_at
      ? new Date(conn.token_expires_at).getTime()
      : 0;
    if (Date.now() >= expiresAt - 60_000) {
      const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: conn.refresh_token,
          client_id: googleClientId,
          client_secret: googleClientSecret,
        }),
      });
      if (!refreshRes.ok) throw new Error("Google token refresh failed");
      const refreshData = await refreshRes.json();
      accessToken = refreshData.access_token;
      const newExpiresAt = new Date(
        Date.now() + refreshData.expires_in * 1000,
      ).toISOString();
      await fetch(
        `${supabaseUrl}/rest/v1/connections_google?owner_id=eq.default`,
        {
          method: "PATCH",
          headers: sbHeaders,
          body: JSON.stringify({
            access_token: accessToken,
            token_expires_at: newExpiresAt,
            updated_at: new Date().toISOString(),
          }),
        },
      );
    }

    const gHeaders = { Authorization: `Bearer ${accessToken}` };
    const adminBase = "https://admin.googleapis.com/admin/directory/v1";

    // 3. List all users
    const userEmails: string[] = [];
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({
        customer: "my_customer",
        maxResults: "500",
        orderBy: "email",
      });
      if (pageToken) params.set("pageToken", pageToken);
      const usersRes = await fetch(`${adminBase}/users?${params}`, {
        headers: gHeaders,
      });
      if (!usersRes.ok) break;
      const usersData = await usersRes.json();
      for (const user of usersData.users ?? []) {
        if (user.primaryEmail) userEmails.push(user.primaryEmail);
      }
      pageToken = usersData.nextPageToken ?? undefined;
    } while (pageToken);

    // 4. Collect tokens per user, aggregate by clientId
    const appMap = new Map<
      string,
      { displayText: string; scopes: Set<string>; userIds: string[] }
    >();
    for (const userId of userEmails) {
      const tokensRes = await fetch(
        `${adminBase}/users/${encodeURIComponent(userId)}/tokens`,
        { headers: gHeaders },
      );
      if (!tokensRes.ok) continue;
      const tokensData = await tokensRes.json();
      for (const token of tokensData.items ?? []) {
        const clientId = token.clientId as string | null;
        if (!clientId) continue;
        if (!appMap.has(clientId)) {
          appMap.set(clientId, {
            displayText: (token.displayText as string | null) ?? clientId,
            scopes: new Set(),
            userIds: [],
          });
        }
        const entry = appMap.get(clientId)!;
        entry.userIds.push(userId);
        for (const scope of (token.scopes as string[] | null) ?? []) {
          entry.scopes.add(scope);
        }
      }
    }

    // 5. Ingest each unique app
    let totalIngested = 0;
    let totalErrors = 0;

    for (const [clientId, app] of appMap) {
      const scopesArr = Array.from(app.scopes);
      const userIdsArr = app.userIds;
      const rawContent = {
        clientId,
        displayText: app.displayText,
        scopes: scopesArr,
        user_ids: userIdsArr,
      };

      const rpcRes = await fetch(
        `${supabaseUrl}/rest/v1/rpc/ingest_google_signal`,
        {
          method: "POST",
          headers: sbHeaders,
          body: JSON.stringify({
            p_owner_id: "default",
            p_source_record_id: clientId,
            p_raw_content: rawContent,
            p_app_id: clientId,
            p_app_name: app.displayText,
            p_scopes: scopesArr,
            p_user_ids: userIdsArr,
            p_user_count: userIdsArr.length,
          }),
        },
      );
      if (rpcRes.ok) {
        totalIngested++;
      } else {
        totalErrors++;
      }
    }

    return new Response(
      JSON.stringify({ ingested: totalIngested, errors: totalErrors }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
