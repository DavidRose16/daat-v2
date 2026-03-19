Deno.serve(async (_req) => {
  const clientId = Deno.env.get("NOTION_CLIENT_ID")!;
  const redirectUri = Deno.env.get("NOTION_REDIRECT_URI")!;

  const state = crypto.randomUUID();

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    owner: "user",
    redirect_uri: redirectUri,
    state,
  });

  const authUrl = `https://api.notion.com/v1/oauth/authorize?${params}`;

  return new Response(null, {
    status: 302,
    headers: {
      Location: authUrl,
      "Set-Cookie": `notion_oauth_state=${state}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600`,
    },
  });
});
