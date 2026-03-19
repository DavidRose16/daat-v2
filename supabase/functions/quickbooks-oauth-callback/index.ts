Deno.serve(async (req) => {
  const integration = "quickbooks";
  const successUrl = `https://daatview.com?integration=${integration}&status=success`;
  const errorUrl = `https://daatview.com?integration=${integration}&status=error`;

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const realmId = url.searchParams.get("realmId");
    const state = url.searchParams.get("state");

    // Verify state cookie
    const cookieHeader = req.headers.get("cookie") ?? "";
    const cookies = Object.fromEntries(
      cookieHeader.split(";").map((c) => {
        const [k, ...v] = c.trim().split("=");
        return [k, v.join("=")];
      })
    );
    if (!state || cookies["qb_oauth_state"] !== state) {
      return Response.redirect(errorUrl, 302);
    }

    if (!code || !realmId) {
      return Response.redirect(errorUrl, 302);
    }

    const clientId = Deno.env.get("QUICKBOOKS_CLIENT_ID")!;
    const clientSecret = Deno.env.get("QUICKBOOKS_CLIENT_SECRET")!;
    const redirectUri = "https://wkimwkhysvvkrujsefyv.supabase.co/functions/v1/quickbooks-oauth-callback";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Exchange code for tokens
    const tokenRes = await fetch(
      "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
          Accept: "application/json",
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
        }),
      }
    );

    if (!tokenRes.ok) {
      return Response.redirect(errorUrl, 302);
    }

    const tokens = await tokenRes.json();
    const accessToken: string = tokens.access_token;
    const refreshToken: string = tokens.refresh_token;
    const expiresIn: number = tokens.expires_in; // seconds

    // Fetch company info
    const companyRes = await fetch(
      `https://quickbooks.api.intuit.com/v3/company/${realmId}/companyinfo/${realmId}?minorversion=65`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      }
    );

    let companyName: string | null = null;
    let companyEmail: string | null = null;
    let country: string | null = null;
    let fiscalYearStartMonth: number | null = null;
    let industry: string | null = null;

    if (companyRes.ok) {
      const companyData = await companyRes.json();
      const info = companyData?.CompanyInfo ?? {};
      companyName = info.CompanyName ?? null;
      companyEmail = info.Email?.Address ?? null;
      country = info.Country ?? null;
      fiscalYearStartMonth = info.FiscalYearStartMonth
        ? parseInt(info.FiscalYearStartMonth, 10)
        : null;
      industry = info.IndustryType ?? null;
    }

    const tokenExpiresAt = new Date(
      Date.now() + expiresIn * 1000
    ).toISOString();

    // Upsert into connections_quickbooks
    const upsertRes = await fetch(
      `${supabaseUrl}/rest/v1/connections_quickbooks`,
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
          realm_id: realmId,
          company_name: companyName,
          company_email: companyEmail,
          country,
          fiscal_year_start_month: fiscalYearStartMonth,
          industry,
          access_token: accessToken,
          refresh_token: refreshToken,
          token_expires_at: tokenExpiresAt,
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
