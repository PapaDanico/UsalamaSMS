/* ============================================================
   Sign in.

   The screen that did not exist, which is why nothing this product
   collected could ever leave a device.

   DESIGN CONSTRAINT, inherited from the report form: this is used by a
   ramp agent on a mid-range Android, and it is the ONLY thing standing
   between them and filing. So it is two fields and a button, it says
   why it is asking, and it never blocks the report form — a person who
   lands here can still file; the report waits in the outbox exactly as
   it does when the radio is off.

   That ordering is deliberate. Requiring a login before the form would
   convert "I have thirty seconds and gloves on" into "I need to
   remember a password", and the research is unambiguous that report
   VOLUME is what kills an SMS. Filing must never be gated. Sending is.
   ============================================================ */

import { html, raw } from '../../shared/html.js';
import { signIn, signOut, isSignedIn, getSession, authFetch } from '../../shared/session.js';
import { flushOutbox } from '../../shared/offline.ts';

const REASONS = {
  invalid: 'That email and password did not match an account. Check both and try again.',
  // The server refuses to distinguish a wrong password from a missing
  // account, because an operator's user list is its staff roster. This
  // message must not undo that by guessing.
  throttled:
    'Too many attempts from this connection. Wait fifteen minutes, or ask your safety office to check the account.',
  offline:
    'No connection, so signing in is not possible right now. You can still file reports — they stay on this device and send when you are back in signal.'
};


/* Four claims, and every one is a mechanism this repository can point
   at rather than a sentiment. Charter rule 7 as it applies here: the
   promise is kept by a mechanism, and a claim printed on a surface a
   customer reads has to name one. */
const TRUST = [
  {
    text: 'Records without a connection — the report is on this device before it is anywhere else',
    icon: '<path d="M5 12.5a7 7 0 0 1 14 0"/><path d="M8.5 16a3.5 3.5 0 0 1 7 0"/><circle cx="12" cy="19.5" r="1"/><path d="M3 3l18 18"/>'
  },
  {
    text: 'A name is attached only if you choose — an anonymous report stores no identifier at all',
    icon: '<path d="M12 3l7 3v6c0 4.2-2.9 7.9-7 9-4.1-1.1-7-4.8-7-9V6z"/><path d="M9 12l2 2 4-4"/>'
  },
  {
    text: 'Every reporting deadline computed on each read, never stored — so no figure goes stale',
    icon: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'
  },
  {
    text: 'Reaches the safety office and nobody else — tenant-scoped, on a hash-chained record',
    icon: '<rect x="4.5" y="10.5" width="15" height="9.5" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>'
  }
];

function Banner(headline, lede) {
  return html`
    <section class="band-dark">
      <div class="wrap">
        <!-- No lockup here. A hero carries one when the nav lockup is
             small and a hundred pixels of scroll away; ours is the same
             size and sits directly above, so a second copy reads as a
             rendering mistake rather than as a statement. -->
        <span class="eyebrow">Account</span>
        <h1>${headline}</h1>
        <p class="lede">${lede}</p>

        <ul class="trust-strip">
          ${TRUST.map(
            (t) => html`<li class="trust-item">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                ${raw(t.icon)}
              </svg>
              <span>${t.text}</span>
            </li>`
          )}
        </ul>
      </div>
    </section>
  `;
}

export function render(outlet) {
  if (isSignedIn()) return renderSignedIn(outlet);
  return renderForm(outlet);
}

function renderSignedIn(outlet) {
  const session = getSession() ?? {};
  outlet.innerHTML = html`
    ${Banner(
      'Signed in',
      html`Reports on this device send automatically from now on.${session.role
        ? html` You are signed in as <strong>${labelForRole(session.role)}</strong>.`
        : ''}`
    )}
    <section class="panel wrap" id="login-panel">
      <button type="button" class="btn btn-secondary" id="sign-out">Sign out</button>
      <p class="hint">
        Signing out does not delete anything you have filed. Reports still
        on this device stay here until someone signs in and they send.
      </p>
    </section>

    <!-- Shown only to a role that actually holds user.manage. The
         server checks too — this is so the screen does not offer an
         action that will be refused, not so the rule lives here. -->
    <!-- Filled by a lazily-imported module, and only for a role that
         holds user.manage. It lived here first and cost 2.5 KB of the
         ENTRY bundle — charged to every ramp agent filing a report, to
         carry a panel one person opens twice a year. The budget caught
         it. -->
    <div id="admin-reset-slot"></div>

    <!-- The operator's own copy. Lazily imported and permission-gated
         inside that module, for the same reason the reset panel is:
         this screen is eager, and a button two people press once a
         quarter must not be weight on a ramp agent's first paint. -->
    <div id="export-slot"></div>
  `.toString();

  outlet.querySelector('#sign-out').addEventListener('click', async () => {
    await signOut();
    window.dispatchEvent(new CustomEvent('usalamasms:session-changed'));
    render(outlet);
  });

  if (session.role === 'SYSTEM_ADMIN') {
    import('./admin-reset.js').then((m) => m.mount(outlet.querySelector('#admin-reset-slot')));
  }
  import('./export-panel.js').then((m) =>
    m.mount(outlet.querySelector('#export-slot'), session.role)
  );
}

function renderForm(outlet) {
  outlet.innerHTML = html`
    ${Banner(
      'Sign in',
      html`Reports are held on this device until somebody signs in. Until then the
        system does not know which operator they belong to, and has nowhere to
        send them.`
    )}
    <section class="panel wrap">
      <p class="lede lede--tight">
        <strong>Signing in is not required to file a report.</strong> Filing
        works with no account and no connection; signing in is what sends what
        is already queued.
      </p>

      <form id="login-form" class="card" novalidate>
        <label class="field">
          <span class="field-label">Email</span>
          <input
            type="email" name="email" id="login-email"
            autocomplete="username" inputmode="email"
            autocapitalize="off" spellcheck="false" required
          class="input-field"/>
        </label>

        <label class="field">
          <span class="field-label">Password</span>
          <input
            type="password" name="password" id="login-password"
            autocomplete="current-password" required
          class="input-field"/>
        </label>

        <button type="submit" class="btn btn-primary btn-block">Sign in</button>
        <p class="field-error" id="login-status" role="status" aria-live="polite"></p>
      </form>

      <!-- A LINK, NOT A PANEL. The form began inline here and cost
           5.6 KB of the ENTRY bundle — charged to every ramp agent
           filing a report, to carry a form an operator fills in once in
           its life. Moving it behind a lazy import still left half a
           kilobyte of slot and loader on the eager screen, so it is a
           destination instead: one anchor here, everything else in the
           route's own chunk. It is also the honest shape — signing up
           is a different job from signing in, and /pricing can link
           straight to it. -->
      <p class="hint">
        <a href="/signup">My operator does not have an account yet</a>
      </p>
    </section>
  `.toString();


  const form = outlet.querySelector('#login-form');
  const status = outlet.querySelector('#login-status');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = form.querySelector('button[type=submit]');
    const email = form.elements.email.value.trim();
    const password = form.elements.password.value;

    if (!email || !password) {
      status.textContent = 'Both fields are needed.';
      return;
    }

    button.disabled = true;
    status.textContent = 'Signing in…';

    const result = await signIn(email, password);

    if (!result.ok) {
      button.disabled = false;
      status.textContent = REASONS[result.reason] ?? REASONS.invalid;
      return;
    }

    // The password is cleared from the DOM as soon as it is spent. It
    // survives in the browser's own autofill store, which is the user's
    // choice; it does not need to survive in ours.
    form.elements.password.value = '';

    window.dispatchEvent(new CustomEvent('usalamasms:session-changed'));

    // Send whatever has been waiting, immediately. Someone who signs in
    // with reports queued did it BECAUSE of the queued reports, and
    // making them wait for the next online event to find out whether it
    // worked is the kind of small silence this product cannot afford.
    // flushOutbox dispatches usalamasms:sync-changed itself when the
    // queue actually moved — see announce() in shared/offline.ts. This
    // used to dispatch it here, which worked and left every other
    // caller to remember; the file-a-report path did not, and the strip
    // sat on "1 report waiting to send" for a report that had arrived.
    const outcome = await flushOutbox();
    render(outlet);

    if (outcome.sent > 0) {
      const panel = outlet.querySelector('#login-panel');
      if (panel) {
        panel.insertAdjacentHTML(
          'beforeend',
          html`<p class="hint" id="login-sent">
            ${outcome.sent} report${outcome.sent === 1 ? '' : 's'} sent.
          </p>`.toString()
        );
      }
    }
  });
}

function labelForRole(role) {
  return String(role)
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
