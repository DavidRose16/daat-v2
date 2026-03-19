Deno.serve(async (req) => {
  const integration = "google";
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
    if (!state || cookies["google_oauth_state"] !== state) {
      return Response.redirect(errorUrl, 302);
    }

    if (!code) {
      return Response.redirect(errorUrl, 302);
    }

    const clientId = Deno.env.get("GOOGLE_CLIENT_ID")!;
    const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
    const redirectUri = Deno.env.get("GOOGLE_REDIRECT_URI")!;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      return Response.redirect(errorUrl, 302);
    }

    const tokens = await tokenRes.json();
    const accessToken: string = tokens.access_token;
    const refreshToken: string = tokens.refresh_token ?? null;
    const expiresIn: number = tokens.expires_in;

    // Fetch customer/domain info from Admin SDK
    const customerRes = await fetch(
      "https://admin.googleapis.com/admin/directory/v1/customers/my_customer",
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    let customerId: string | null = null;
    let domain: string | null = null;
    let organizationName: string | null = null;

    if (customerRes.ok) {
      const customerData = await customerRes.json();
      customerId = customerData.id ?? null;
      domain = customerData.customerDomain ?? null;
      organizationName = customerData.organizationName ?? null;
    }

    const tokenExpiresAt = new Date(
      Date.now() + expiresIn * 1000
    ).toISOString();

    // Upsert into connections_google
    const upsertRes = await fetch(`${supabaseUrl}/rest/v1/connections_google`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseServiceKey}`,
        apikey: supabaseServiceKey,
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify({
        owner_id: "default",
        customer_id: customerId,
        domain,
        organization_name: organizationName,
        access_token: accessToken,
        refresh_token: refreshToken,
        token_expires_at: tokenExpiresAt,
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
