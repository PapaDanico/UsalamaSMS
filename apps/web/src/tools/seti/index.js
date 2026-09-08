// SET-I assessment ledger: evidence first, then rating.
import { html } from '../../shared/html.js';
import { authFetch, isSignedIn } from '../../shared/session.js';

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export async function render(outlet) {
  if (!isSignedIn()) {
    outlet.innerHTML = html`<section class="panel wrap"><h1>SET-I-aligned self-assessment</h1><p>Sign in with a safety-management role to record evidence against the supplied SET-I criteria.</p><p>This is not the official UK CAA tool, a CAA assessment, or evidence of regulatory conformance.</p><p><a href="/report">File a confidential or anonymous safety report</a></p><p><a href="/account">Sign in</a></p></section>`.toString();
    return;
  }
  const requestedId = new URLSearchParams(window.location.search).get("id");
  if (requestedId) return renderAssessment(outlet, requestedId);

  outlet.innerHTML = html`<section class="panel wrap"><h1>SET-I-aligned self-assessment</h1><p>Record evidence against all 48 supplied SET-I criteria. A rating requires evidence, source references, an accountable post, and a review date.</p><p class="note"><strong>Assessment boundary:</strong> this ledger supports an organisation self-assessment. It is not the official UK CAA tool, does not record a CAA assessment, and does not determine conformance.</p><p>If this review identifies a safety concern, <a href="/report">file a confidential or anonymous safety report</a>.</p><form id="seti-create"><label>Assessment title<input name="title" required maxlength="200" placeholder="Initial oversight readiness review" /></label><label>Scope<textarea name="scope" required minlength="10" maxlength="6000" placeholder="Organisation, approvals, operations, assessment boundary and period."></textarea></label><label>Assessment date<input name="assessedOn" type="date" required /></label><button type="submit">Create assessment</button></form><div id="seti-list" aria-live="polite"></div></section>`.toString();
  outlet.querySelector("[name=assessedOn]").value = new Date().toISOString().slice(0, 10);
  const list = outlet.querySelector("#seti-list");
  try {
    const response = await authFetch("/api/v1/seti");
    if (!response.ok) throw new Error("not_available");
    const { assessments } = await response.json();
    list.innerHTML = assessments.length ? `<h2>Previous assessments</h2><ul>${assessments.map((a) => `<li><a href="/seti?id=${encodeURIComponent(a.id)}">${esc(a.title)}</a> — ${new Date(a.assessedOn).toLocaleDateString()}</li>`).join("")}</ul>` : "<p>No assessment recorded yet.</p>";
  } catch { list.innerHTML = "<p>The assessment ledger is unavailable. Check your connection and permissions.</p>"; }
  outlet.querySelector("#seti-create").addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.currentTarget));
    const response = await authFetch("/api/v1/seti", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (!response.ok) return void (list.innerHTML = "<p>Assessment could not be created. Check the required fields and your permissions.</p>");
    const { assessment } = await response.json();
    window.location.assign(`/seti?id=${encodeURIComponent(assessment.id)}`);
  });
}

async function renderAssessment(outlet, id) {
  const response = await authFetch(`/api/v1/seti/${encodeURIComponent(id)}`);
  if (!response.ok) {
    outlet.innerHTML = `<section class="panel wrap"><h1>SET-I assessment</h1><p>This assessment is unavailable.</p><p><a href="/seti">Back to assessments</a></p></section>`;
    return;
  }
  const { assessment, criteria } = await response.json();
  const byId = new Map(assessment.items.map((item) => [item.criterionId, item]));
  outlet.innerHTML = `<section class="panel wrap"><p><a href="/seti">Back to assessments</a></p><h1>${esc(assessment.title)}</h1><p>${esc(assessment.scope)}</p><p>Assessed ${new Date(assessment.assessedOn).toLocaleDateString()} by ${esc(assessment.assessor.name)}.</p><div id="seti-items">${criteria.map((criterion) => itemCard(criterion, byId.get(criterion.id))).join("")}</div></section>`;
  /* THE FORM IS CAPTURED BEFORE THE AWAIT, and that is the whole fix.
     `event.currentTarget` is only valid while the event is being
     dispatched; the moment this handler yields at `await` the browser
     sets it to null. The two reads above the await worked, the one
     below it threw `Cannot read properties of null (reading
     'querySelector')` on every single save — so a rating that SAVED
     said nothing, and a rating the API REFUSED said nothing either.
     The one line of feedback this screen has was unreachable in both
     directions.

     Driven at 390x844 before the fix: the criterion persisted, the
     exception fired, and the status output stayed empty. An assessor
     filling 48 criteria had no way to tell which had taken. */
  for (const form of outlet.querySelectorAll(".seti-item")) form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const el = event.currentTarget;
    const criterionId = el.dataset.criterion;
    const body = Object.fromEntries(new FormData(el));
    const note = el.querySelector(".seti-status");
    note.dataset.state = "pending";
    note.textContent = "Saving…";
    const saved = await authFetch(`/api/v1/seti/${encodeURIComponent(id)}/items/${encodeURIComponent(criterionId)}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    note.dataset.state = saved.ok ? "ok" : "error";
    note.textContent = saved.ok ? "Saved" : "Could not save: all evidence fields are required.";
  });
}

function itemCard(criterion, item = {}) {
  const level = item.level ?? "";
  return `<article class="card"><h2>${esc(criterion.id)} — ${esc(criterion.title)}</h2><p>${esc(criterion.section)}</p><form class="seti-item" data-criterion="${esc(criterion.id)}"><label>Assessment<select name="level" required><option value="">Select</option>${["PRESENT", "SUITABLE", "OPERATING", "EFFECTIVE"].map((value) => `<option value="${value}"${value === level ? " selected" : ""}>${value}</option>`).join("")}</select></label><label>Evidence<textarea name="evidence" required minlength="10">${esc(item.evidence)}</textarea></label><label>Source references<textarea name="sourceRefs" required minlength="3" placeholder="Document name, revision, page and paragraph.">${esc(item.sourceRefs)}</textarea></label><label>Accountable post<input name="ownerPost" required value="${esc(item.ownerPost)}" /></label><label>Review due<input type="date" name="reviewDueOn" required value="${item.reviewDueOn ? String(item.reviewDueOn).slice(0, 10) : ""}" /></label><label>Assessor notes<textarea name="assessorNotes">${esc(item.assessorNotes)}</textarea></label><button type="submit">Save criterion</button><output class="seti-status"></output></form></article>`;
}
