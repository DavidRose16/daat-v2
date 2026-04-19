// Shared auth utilities — loaded as a synchronous script before each page script.
// Defines globals: SB_URL, SB_ANON, FN_URL, daatGetAuth(), daatSignOut(), daatSetOnboardingState()
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
// Returns { session, token, workspaceId, onboardingState, sb } or redirects to /login and returns null.
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
    .select('workspace_id, workspaces(onboarding_state)')
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
    onboardingState: profile.workspaces?.onboarding_state || 'welcome',
    sb,
  };
}

// Advance (or reset) the workspace onboarding state. Pass one of:
// 'welcome' | 'connect' | 'processing' | 'ready'
async function daatSetOnboardingState(auth, state) {
  const { error } = await auth.sb
    .from('workspaces')
    .update({ onboarding_state: state })
    .eq('id', auth.workspaceId);
  if (error) throw error;
  auth.onboardingState = state;
}

function daatSignOut() {
  _getClient().auth.signOut().then(() => {
    window.location.href = '/';
  });
}

// Render the shared signed-in top bar. Pages place <div id="daat-shell"></div>
// and call daatShell({ active, inFlow }) early.
//   active: 'ask' | 'connect' | 'lab' | null   — highlights the matching nav link
//   inFlow: boolean                            — hides nav links during onboarding
function daatShell({ active = null, inFlow = false } = {}) {
  const mount = document.getElementById('daat-shell');
  if (!mount) return;
  const cls = (k) => 'daat-nav-link' + (active === k ? ' active' : '');
  mount.outerHTML = `
    <header class="daat-topbar${inFlow ? ' in-flow' : ''}">
      <a class="daat-brand" href="/ask" aria-label="Daat home">
        <img class="daat-brand-mark" src="/assets/Daat-Logo.png" alt="">
        <span class="daat-brand-word">Daat</span>
      </a>
      <nav class="daat-nav" aria-label="Primary">
        <a class="${cls('ask')}"      href="/ask">Ask</a>
        <a class="${cls('connect')}"  href="/connect">Connect</a>
        <a class="${cls('lab')} demoted" href="/lab">Lab</a>
      </nav>
      <div class="daat-topbar-right">
        <button class="daat-signout" onclick="daatSignOut()">Sign out</button>
      </div>
    </header>
  `;
}
