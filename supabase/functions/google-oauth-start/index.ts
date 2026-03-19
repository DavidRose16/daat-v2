Deno.serve(async (_req) => {
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID")!;
  const redirectUri = "https://wkimwkhysvvkrujsefyv.supabase.co/functions/v1/google-oauth-callback";

  const state = crypto.randomUUID();

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    scope: [
      "openid",
      "email",
      "profile",
      "https://www.googleapis.com/auth/admin.directory.customer.readonly",
    ].join(" "),
    redirect_uri: redirectUri,
    access_type: "offline",
    prompt: "consent",
    state,
  });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;

  return new Response(null, {
    status: 302,
    headers: {
      Location: authUrl,
      "Set-Cookie": `google_oauth_state=${state}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600`,
    },
  });
});
