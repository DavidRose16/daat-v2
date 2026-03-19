Deno.serve(async (_req) => {
  const clientId = Deno.env.get("SLACK_CLIENT_ID")!;
  const redirectUri = Deno.env.get("SLACK_REDIRECT_URI")!;

  const state = crypto.randomUUID();

  const params = new URLSearchParams({
    client_id: clientId,
    scope: "team:read,users:read",
    redirect_uri: redirectUri,
    state,
  });

  const authUrl = `https://slack.com/oauth/v2/authorize?${params}`;

  return new Response(null, {
    status: 302,
    headers: {
      Location: authUrl,
      "Set-Cookie": `slack_oauth_state=${state}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600`,
    },
  });
});
