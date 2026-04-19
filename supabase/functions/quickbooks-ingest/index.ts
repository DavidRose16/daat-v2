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
  const qbClientId = Deno.env.get("QUICKBOOKS_CLIENT_ID")!;
  const qbClientSecret = Deno.env.get("QUICKBOOKS_CLIENT_SECRET")!;

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
      `${supabaseUrl}/rest/v1/connections_quickbooks?owner_id=eq.${workspaceId}&limit=1`,
      { headers: sbHeaders },
    );
    if (!connRes.ok) throw new Error("Failed to read QB connection");
    const [conn] = await connRes.json();
    if (!conn) {
      return new Response(
        JSON.stringify({ error: "No QuickBooks connection found" }),
        { status: 404, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    let accessToken: string = conn.access_token;
    let refreshToken: string = conn.refresh_token;
    const realmId: string = conn.realm_id;

    // 2. Refresh token if expired or within 60 seconds of expiry
    const expiresAt = conn.token_expires_at
      ? new Date(conn.token_expires_at).getTime()
      : 0;
    if (Date.now() >= expiresAt - 60_000) {
      const refreshRes = await fetch(
        "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: `Basic ${btoa(`${qbClientId}:${qbClientSecret}`)}`,
            Accept: "application/json",
          },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: refreshToken,
          }),
        },
      );
      if (!refreshRes.ok) throw new Error("QB token refresh failed");
      const refreshData = await refreshRes.json();
      accessToken = refreshData.access_token;
      refreshToken = refreshData.refresh_token;
      const newExpiresAt = new Date(
        Date.now() + refreshData.expires_in * 1000,
      ).toISOString();
      await fetch(
        `${supabaseUrl}/rest/v1/connections_quickbooks?owner_id=eq.${workspaceId}`,
        {
          method: "PATCH",
          headers: sbHeaders,
          body: JSON.stringify({
            access_token: accessToken,
            refresh_token: refreshToken,
            token_expires_at: newExpiresAt,
            updated_at: new Date().toISOString(),
          }),
        },
      );
    }

    const qbApiBase = `https://quickbooks.api.intuit.com/v3/company/${realmId}`;
    const qbHeaders = {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    };

    let totalIngested = 0;
    let totalErrors = 0;
    const seenIds = new Set<string>();

    // 3. Fetch and ingest each entity type
    for (const entityType of ["Purchase", "Bill", "Invoice"] as const) {
      let startPosition = 1;
      const maxResults = 1000;

      while (true) {
        const query =
          `SELECT * FROM ${entityType} STARTPOSITION ${startPosition} MAXRESULTS ${maxResults}`;
        const queryRes = await fetch(
          `${qbApiBase}/query?query=${encodeURIComponent(query)}&minorversion=65`,
          { headers: qbHeaders },
        );
        if (!queryRes.ok) break;
        const queryData = await queryRes.json();
        const entities: Record<string, unknown>[] =
          queryData?.QueryResponse?.[entityType] ?? [];

        for (const entity of entities) {
          const sourceRecordId = `${entityType}:${entity.Id}`;
          seenIds.add(sourceRecordId);
          const mapped = mapQBEntity(entity, entityType);
          const rpcRes = await fetch(
            `${supabaseUrl}/rest/v1/rpc/ingest_quickbooks_signal`,
            {
              method: "POST",
              headers: sbHeaders,
              body: JSON.stringify({
                p_owner_id: workspaceId,
                p_source_record_id: sourceRecordId,
                p_raw_content: entity,
                ...mapped,
              }),
            },
          );
          if (rpcRes.ok) {
            totalIngested++;
          } else {
            totalErrors++;
          }
        }

        if (entities.length < maxResults) break;
        startPosition += maxResults;
      }
    }

    // 4. Reconcile: delete signals no longer in QuickBooks
    const reconcileRes = await fetch(
      `${supabaseUrl}/rest/v1/rpc/reconcile_signals`,
      {
        method: "POST",
        headers: sbHeaders,
        body: JSON.stringify({
          p_source: "quickbooks",
          p_owner_id: workspaceId,
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

type QBEntityType = "Purchase" | "Bill" | "Invoice";

function mapQBEntity(
  entity: Record<string, unknown>,
  entityType: QBEntityType,
): Record<string, unknown> {
  const lines = (entity.Line as Record<string, unknown>[] | null) ?? [];
  const txnTaxDetail =
    (entity.TxnTaxDetail as Record<string, unknown> | null) ?? {};
  const currencyRef =
    (entity.CurrencyRef as Record<string, unknown> | null) ?? {};
  const txnDate = entity.TxnDate
    ? new Date(entity.TxnDate as string).toISOString()
    : null;

  let vendorName: string | null = null;
  let vendorId: string | null = null;
  let paymentMethod: string | null = null;
  let accountName: string | null = null;
  let category: string | null = null;
  let className: string | null = null;
  let isBillable = false;

  if (entityType === "Purchase") {
    const entityRef =
      (entity.EntityRef as Record<string, unknown> | null) ?? {};
    vendorName = (entityRef.name as string | null) ?? null;
    vendorId = (entityRef.value as string | null) ?? null;
    paymentMethod = (entity.PaymentType as string | null) ?? null;
    const acctRef =
      (entity.AccountRef as Record<string, unknown> | null) ?? {};
    accountName = (acctRef.name as string | null) ?? null;
  } else if (entityType === "Bill") {
    const vendorRef =
      (entity.VendorRef as Record<string, unknown> | null) ?? {};
    vendorName = (vendorRef.name as string | null) ?? null;
    vendorId = (vendorRef.value as string | null) ?? null;
    const apRef =
      (entity.APAccountRef as Record<string, unknown> | null) ?? {};
    accountName = (apRef.name as string | null) ?? null;
  } else if (entityType === "Invoice") {
    const customerRef =
      (entity.CustomerRef as Record<string, unknown> | null) ?? {};
    vendorName = (customerRef.name as string | null) ?? null;
    vendorId = (customerRef.value as string | null) ?? null;
    const arRef =
      (entity.ARAccountRef as Record<string, unknown> | null) ?? {};
    accountName = (arRef.name as string | null) ?? null;
  }

  // Extract category, class, billable from line items
  for (const line of lines) {
    const detail =
      (line.AccountBasedExpenseLineDetail as Record<string, unknown> | null) ??
      (line.ItemBasedExpenseLineDetail as Record<string, unknown> | null) ??
      (line.SalesItemLineDetail as Record<string, unknown> | null);
    if (!detail) continue;
    if (!category) {
      const acctRef = (detail.AccountRef as Record<string, unknown> | null) ??
        {};
      const itemRef = (detail.ItemRef as Record<string, unknown> | null) ?? {};
      category =
        ((acctRef.name ?? itemRef.name) as string | null) ?? null;
    }
    if (!className) {
      const classRef =
        (detail.ClassRef as Record<string, unknown> | null) ?? {};
      className = (classRef.name as string | null) ?? null;
    }
    if (!isBillable && detail.BillableStatus === "Billable") {
      isBillable = true;
    }
  }

  return {
    p_vendor_name: vendorName,
    p_vendor_id: vendorId,
    p_amount: (entity.TotalAmt as number | null) ?? null,
    p_currency: (currencyRef.value as string | null) ?? null,
    p_transaction_date: txnDate,
    p_transaction_type: entityType,
    p_category: category,
    p_payment_method: paymentMethod,
    p_memo: (entity.PrivateNote as string | null) ?? null,
    p_account_name: accountName,
    p_class_name: className,
    p_tax_amount: (txnTaxDetail.TotalTax as number | null) ?? null,
    p_is_billable: isBillable,
  };
}
