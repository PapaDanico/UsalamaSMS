import { html } from '../../shared/html.js';
import { authFetch } from '../../shared/session.js';
import { can } from '../../../../../packages/shared/src/permissions.ts';

/* ============================================================
   THE OPERATOR'S OWN COPY.

   LAZY, for the same reason the reset panel next door is, and the
   budget caught this one the same way. The account screen is EAGER —
   signing in is what sends a queued report, so it cannot wait for a
   fetch — which means anything living inside it is charged to the
   first paint of the form a ramp agent opens at a strip. This panel
   plus the RBAC matrix it needs came to just over 2 KB there, to carry
   a button two people press once a quarter.

   Split out, it is fetched only for a role that holds org.export, and
   the matrix rides in the shared `rbac` chunk with it rather than in
   the entry. See apps/web/vite.config.js.

   WHY THE DOWNLOAD IS NOT A LINK. The endpoint needs an Authorization
   header and an `<a href>` cannot carry one, so the response is read
   as a blob and handed over through an object URL — revoked
   immediately, because an object URL that outlives its click pins the
   entire export in memory for the life of the document, and this is
   the largest thing the product ever puts there.
   ============================================================ */

function Panel() {
  return html`
    <section class="panel wrap" id="export-panel">
      <h2 class="section-title">Your operator's own copy</h2>
      <p class="hint">
        Everything this operator holds here, as one file: reports and their
        narratives, hazards and assessments, the safety policy and who signed
        it, the accountability matrix, appointments, exercises, controlled
        documents, audit findings, training and bulletins — with the
        append-only log and the verdict from verifying it, so the copy can be
        checked without taking our word for it.
      </p>
      <p class="hint">
        It carries no password and names no reporter of an anonymous report.
        Taking a copy is itself written to the log.
      </p>
      <button type="button" class="btn btn-primary" id="export-run">
        Download the record
      </button>
      <p class="field-error" id="export-status" role="status" aria-live="polite"></p>
    </section>
  `;
}

/**
 * Render the panel, if this role may take the copy.
 *
 * The permission is decided HERE rather than by the account screen
 * that loads this. Putting it there would mean either importing the
 * RBAC matrix into the eager bundle — the 2 KB this split exists to
 * avoid — or restating which roles hold org.export in a second place,
 * which is the drift this codebase keeps one matrix to prevent. The
 * cost is that a role without the permission fetches 1.5 KB on the
 * account screen and renders nothing from it. That is a fetch after
 * sign-in, not weight on the report form.
 *
 * The server checks too. This is so the screen does not offer an
 * action that will be refused, not so the rule lives here.
 */
export function mount(root, role) {
  if (!root) return;
  let allowed = false;
  try {
    allowed = can(role, 'org.export');
  } catch {
    // can() throws on a role it does not know. A stale session must not
    // take the account screen down with it.
    allowed = false;
  }
  if (!allowed) return;

  root.innerHTML = Panel().toString();
  const button = root.querySelector('#export-run');
  const status = root.querySelector('#export-status');
  const say = (m) => {
    if (status) status.textContent = m;
  };

  button.addEventListener('click', async () => {
    /* Disabled while it runs. A safety manager who clicks twice on a
       slow connection would otherwise take two complete copies and
       write two disclosure entries for one intention. */
    const label = button.textContent;
    button.disabled = true;
    button.textContent = 'Collecting the record…';
    say('');

    let url;
    try {
      const res = await authFetch('/api/v1/export');
      if (!res.ok) {
        say(
          res.status === 403
            ? 'Your role cannot take a copy of the whole record.'
            : 'The record could not be collected. Nothing was downloaded.'
        );
        return;
      }
      const blob = await res.blob();
      url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `usalamasms-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      say('Downloaded. Keep it somewhere the operator controls.');
    } catch {
      say('Could not reach the safety office. Nothing was downloaded — try again on a connection.');
    } finally {
      if (url) URL.revokeObjectURL(url);
      button.disabled = false;
      button.textContent = label;
    }
  });
}
