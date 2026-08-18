/* ============================================================
   The SMS training programme, published rather than locked behind a
   sign-in.

   WHY THIS PAGE EXISTS. The curriculum has been in the product since
   element 4.1 gained a training matrix, and it was reachable from
   exactly two signed-in screens: the matrix, which uses it to compute
   gaps, and the strip, which counts lapses. So an operator deciding
   whether to adopt this product could see that training was tracked and
   could not see WHAT IS IN THE COURSE — which is the question a safety
   manager actually asks, and the one a competitor's brochure answers.

   IT IS ALSO THE HONEST HALF OF A PAID DELIVERABLE. The tailored
   programme document is a paid output. The syllabus it is built from is
   not, and putting the outlines behind the same gate would make the
   pricing page's own promise false: every Annex 19 element this product
   covers is on every band, with no element behind a tier.

   WHAT IT RENDERS AND WHAT IT REFUSES TO CLAIM. Every row comes from
   packages/shared/src/curriculum.ts, read from CAA-AC-SMS011, and the
   course shapes come from stp.ts, which follows ICAO's TRAINAIR PLUS
   method. The page says both of those and says which is which. It does
   NOT say this is an ICAO Standardized Training Package, because ICAO's
   STPs are ICAO's own validated products and an operator handed a
   document claiming otherwise has been told something an auditor can
   disprove.

   THE TWO NUMBERS THAT CARRY A CAVEAT WITH THEM, everywhere they
   appear:

     · the refresher interval is Appendix I's RECOMMENDATION, not a
       period in the Regulations. An operator told otherwise would
       budget for a legal obligation that does not exist;
     · the per-module minutes are DERIVED here, weighted by section
       count, because the circular gives a duration per band and none
       per module. A training manager who knows their operation should
       overrule them, and the page says so rather than presenting them
       as the circular's.
   THE TIME GRID IS FOCUSABLE ON PURPOSE. It is the only table on a
   public page wide enough to scroll on a handset, and a scrollable
   region a keyboard cannot reach is a WCAG 2.2 AA violation — caught by
   check:a11y on this page's first run, not reasoned about in advance.
   tabindex makes it reachable; role and aria-label mean a screen reader
   announces what the reader has landed in rather than an unnamed box.
   ============================================================ */

import { html } from '../../shared/html.js';
import { ToolNav } from '../../shared/tool-nav.js';
import {
  SYLLABUS_MODULES, SYLLABUS_NOTE, TRAINING_BANDS, RECOMMENDED_TIMING,
  EXECUTIVE_TOPICS, SPECIALISED_FUNCTIONS, ASSESSMENT_METHODS,
  OUTCOME_LEVELS, CURRICULUM_INSTRUMENT, CURRICULUM_SOURCE,
  INITIAL_TOPICS
} from '../../../../../packages/shared/src/curriculum.ts';
import { allOutlines, STP_METHOD_SOURCE, IS_AN_ICAO_STP } from '../../../../../packages/shared/src/stp.ts';

const hours = (minutes) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
};

export async function render(outlet) {
  const outlines = allOutlines();

  outlet.innerHTML = html`
    <section class="panel">
      ${ToolNav('/training')}
      <header class="page-head">
        <span class="eyebrow">Element 4.1 — training and education</span>
        <h1>The SMS training programme</h1>
        <p class="lede">
          What the course covers, who sits which version of it, and how
          long each one runs. Taken from
          ${CURRICULUM_INSTRUMENT.reference}, the Authority's own
          advisory circular on SMS training, and laid out in the way
          ICAO's TRAINAIR PLUS method lays out a course.
        </p>
      </header>

      <p class="notice">
        <strong>This is not an ICAO Standardized Training Package.</strong>
        ICAO's STPs are ICAO's own validated products. What is published
        here follows the same method — the same course description,
        course content, timetable and module plan, and the same
        Conditions / Performance / Standard objective — carrying the
        syllabus your regulator publishes.
      </p>

      <h2>Who sits which course</h2>
      <p class="picture-note">
        Appendix I of ${CURRICULUM_INSTRUMENT.reference} sets four bands
        and the duration of each. Every band covers every module — the
        depth changes, the syllabus does not. Dropping a module from the
        shorter course would tell a finance director that safety data
        protection is not their concern, and section 9.1.11 puts it
        directly on their list.
      </p>
      <ul class="picture-list" role="list">
        ${TRAINING_BANDS.map(
          (b) => html`<li>
            <strong>${b.who}</strong>
            <span class="barrier__meta">
              ${b.days} day${b.days === 1 ? '' : 's'} ·
              ${b.practicalRequired
                ? 'knowledge and awareness, plus skills and practical application'
                : 'knowledge and awareness assessment'}
              ${b.examples.length ? html` · ${b.examples.join(', ')}` : ''}
            </span>
          </li>`
        )}
      </ul>

      <h2>The six topics every course must cover</h2>
      <p class="picture-note">
        Section 8.1 sets these as the minimum for everybody, whatever
        their role. They are not six courses to buy — six subjects a
        programme has to cover, however it is delivered.
      </p>
      <ul class="picture-list" role="list">
        ${INITIAL_TOPICS.map(
          (c) => html`<li><strong>${c.label}</strong>
            <span class="barrier__meta">${c.why}</span></li>`
        )}
      </ul>

      <h2>The module syllabus</h2>
      <p class="picture-note">${SYLLABUS_NOTE}</p>
      <ol class="picture-list" role="list">
        ${SYLLABUS_MODULES.map(
          (m) => html`<li>
            <strong>Module ${m.number} — ${m.title}</strong>
            <span class="barrier__meta">${m.purpose}</span>
            <ul class="training-sections" role="list">
              ${m.sections.map((s) => html`<li>${s}</li>`)}
            </ul>
          </li>`
        )}
      </ol>

      <h2>Time on each module</h2>
      <p class="picture-note">
        <strong>Derived, not from the circular.</strong> Appendix I gives
        a duration per band and Appendix II gives modules with no
        durations at all, so the split below is weighted by how many
        sections each module carries. A training manager who knows their
        operation should overrule it.
      </p>
      <div class="table-scroll" tabindex="0" role="region"
           aria-label="Minutes per module, by course band">
        <table class="training-grid">
          <caption class="visually-hidden">Minutes per module, by course band</caption>
          <thead>
            <tr>
              <th scope="col">Module</th>
              ${outlines.map((o) => html`<th scope="col">${o.days} day${o.days === 1 ? '' : 's'}</th>`)}
            </tr>
          </thead>
          <tbody>
            ${SYLLABUS_MODULES.map(
              (m, i) => html`<tr>
                <th scope="row">${m.number}. ${m.title}</th>
                ${outlines.map((o) => html`<td>${hours(o.content[i].minutes)}</td>`)}
              </tr>`
            )}
          </tbody>
        </table>
      </div>

      <h2>What the accountable executive and senior managers are trained in</h2>
      <p class="picture-note">
        Section 9.1, in full. It is the one part of the programme tied to
        a person's appointment rather than to their trade.
      </p>
      <ul class="picture-list" role="list">
        ${EXECUTIVE_TOPICS.map((t) => html`<li>${t}</li>`)}
      </ul>

      <h2>Specialised functions this course does not cover</h2>
      <p class="picture-note">
        Section 10.2 names these as beyond the basics of an SMS training
        programme, and says they may need externally provided
        qualifications. Said here rather than left out, so an operator
        can see which of its people need something this programme does
        not deliver.
      </p>
      <ul class="picture-list" role="list">
        ${SPECIALISED_FUNCTIONS.map((f) => html`<li>${f}</li>`)}
      </ul>

      <h2>How it is assessed</h2>
      <p class="picture-note">
        Section 12: competency based, not compliance based. Each
        individual is assessed, and the programme must take remedial
        action where competence is not demonstrated.
      </p>
      <ul class="picture-list" role="list">
        ${ASSESSMENT_METHODS.map((a) => html`<li>${a}</li>`)}
      </ul>
      <p class="picture-note">
        Section 11 sets four outcome levels.
        ${OUTCOME_LEVELS.filter((o) => o.forEveryone).map((o) => o.label).join(' and ')}
        are expected of everybody;
        ${OUTCOME_LEVELS.filter((o) => !o.forEveryone).map((o) => o.label).join(' and ')}
        are for operational safety-critical roles, who carry more of the
        safety performance.
      </p>

      <h2>Before the course: the training needs analysis</h2>
      <p class="picture-note">
        Sections 5 and 6 put a step in front of everything above.
        The service provider "shall determine who should be trained and
        to what depth", and the circular names seven ways to work that
        out — organisational, person, job and task, performance,
        content, training suitability, and cost-benefit analysis. The
        syllabus below is what a course contains; the needs analysis is
        what decides who sits it and at what depth.
      </p>
      <p class="notice">
        <strong>This product does not do that analysis.</strong> It holds
        the record of who was trained, in what, and when it lapses —
        which is the half that has to survive an audit. Deciding who
        needs what, against a real operation, is consulting work.
        <a href="https://jkassociates.enterprises/tools/training-tna.html"
           target="_blank" rel="noopener noreferrer">
          JK &amp; Associates publishes a training needs analysis tool
        </a>
        for an operator that wants to run it themselves. Use it if it
        helps; nothing here depends on it, and no data leaves this
        product to reach it.
      </p>

      <h2>When it is due</h2>
      <p class="notice">
        <strong>Initial within ${RECOMMENDED_TIMING.initialWithinMonths} months
        of starting; refresher every ${RECOMMENDED_TIMING.refresherMonths} months.</strong>
        ${RECOMMENDED_TIMING.status}
      </p>

      <h2>Where this comes from</h2>
      <p class="picture-note">${CURRICULUM_SOURCE}</p>
      <p class="picture-note">${STP_METHOD_SOURCE}</p>
      ${CURRICULUM_INSTRUMENT.issuedDateDisputed
        ? html`<p class="picture-note">
            A note on the citation: ${CURRICULUM_INSTRUMENT.issuedDateDisputed}
            The cover is what is recorded here, and the discrepancy is
            written down rather than resolved silently — an operator
            searching the Authority's index may find either month and
            needs to know the two refer to one document.
          </p>`
        : ''}
      ${IS_AN_ICAO_STP ? html`<p class="notice notice--error">Provenance claim mismatch.</p>` : ''}
    </section>
  `.toString();
}
