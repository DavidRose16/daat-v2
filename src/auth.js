// Shared auth utilities — loaded as a synchronous script before each page script.
// Defines globals: SB_URL, SB_ANON, FN_URL, daatGetAuth(), daatSignOut()
// Also injects .daat-signout button styles.

const SB_URL  = 'https://wkimwkhysvvkrujsefyv.supabase.co';
const SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndraW13a2h5c3Z2a3J1anNlZnl2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4NzA1ODMsImV4cCI6MjA4OTQ0NjU4M30.5VqJrBgElAzrkWnsT3Kza0tFlwUvYSMrv-lbgnpBymM';
const FN_URL  = 'https://wkimwkhysvvkrujsefyv.supabase.co/functions/v1';

let _sb = null;

function _getClient() {
  if (!_sb) _sb = window.supabase.createClient(SB_URL, SB_ANON);
  return _sb;
}

// Call at the start of every protected page.
// Returns { session, token, workspaceId, sb } or redirects to /login and returns null.
async function daatGetAuth() {
  const sb = _getClient();
  const { data: { session } } = await sb.auth.getSession();

  if (!session) {
    const dest = encodeURIComponent(window.location.pathname);
    window.location.href = `/login?next=${dest}`;
    return null;
  }

  const { data: profile, error } = await sb
    .from('profiles')
    .select('workspace_id')
    .eq('user_id', session.user.id)
    .single();

  if (error || !profile) {
    await sb.auth.signOut();
    window.location.href = '/login';
    return null;
  }

  return {
    session,
    token: session.access_token,
    workspaceId: profile.workspace_id,
    sb,
  };
}

function daatSignOut() {
  _getClient().auth.signOut().then(() => {
    window.location.href = '/';
  });
}

// Inject sign-out button styles so each page doesn't need to duplicate them.
(function () {
  const s = document.createElement('style');
  s.textContent = '.daat-signout{margin-left:auto;background:transparent;border:none;font-size:12px;font-weight:500;padding:12px 16px;color:#555;cursor:pointer;letter-spacing:.02em;transition:color .12s;white-space:nowrap}.daat-signout:hover{color:#888}';
  document.head.appendChild(s);
}());
