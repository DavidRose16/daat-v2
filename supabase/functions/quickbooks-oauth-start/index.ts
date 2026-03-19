Deno.serve(async (_req) => {
  const clientId = Deno.env.get("QUICKBOOKS_CLIENT_ID")!;
  const redirectUri = Deno.env.get("QUICKBOOKS_REDIRECT_URI")!;

  const state = crypto.randomUUID();

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    scope: "com.intuit.quickbooks.accounting openid profile email",
    redirect_uri: redirectUri,
    state,
  });

  const authUrl = `https://appcenter.intuit.com/connect/oauth2?${params}`;

  return new Response(null, {
    status: 302,
    headers: {
      Location: authUrl,
      "Set-Cookie": `qb_oauth_state=${state}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600`,
    },
  });
});
