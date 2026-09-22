/* ============================================================
   A DELIVERABLE PRINTS AS A RECORD, NOT AS THE FORM THAT TOOK IT.

   THE DEFECT THIS EXISTS FOR, measured by rendering all nine handover
   documents at A4 with the media emulated to print and reading them:

     /evaluation   34 pages · 48 dropdowns · 232 empty boxes
     /toolkits/culture   6 pages · 70 empty radio buttons
     /sms           7 pages · 22 empty boxes

   On paper a `<select>` printed with its chevron, a date field printed
   `01/31/2027` beside a calendar icon, every required marker printed
   its asterisk, every field printed the help text written to guide
   somebody FILLING IT IN, and an empty textarea printed as a box with
   a resize handle in the corner. The stylesheet had been dressing the
   controls up — borders off, a rule underneath — and the document
   was still a form.

   That is the difference between a screen and a deliverable. An
   auditor is handed loose paper: what belongs on it is the operator's
   answer, typeset, and nothing that only means something to a person
   sitting in front of the browser.

   SO THE CONTROLS ARE TRANSPOSED. On `beforeprint` every control is
   replaced, in place, by its value as text; on `afterprint` every
   inserted node is removed and the screen is exactly as it was. The
   stylesheet cannot do this alone — CSS cannot read a select's chosen
   option or an input's value — which is the same reason the
   disclosure rule below needs JavaScript.

   ------------------------------------------------------------
   A COLLAPSED DISCLOSURE PRINTS EXPANDED, IN EVERY ENGINE.

   The print stylesheet has claimed this since the questions page was
   written, and the claim was a stylesheet's to make only in Chromium:
   it auto-expands a closed <details> for printing and honours
   ::details-content. Firefox and WebKit do neither, so an operator who
   printed /faq or /tutorials from Safari — the browser on the iPad a
   safety manager carries — got the questions and none of the answers.

   CSS CANNOT CHANGE AN ELEMENT'S STATE. `open` is a property, so the
   only honest mechanism is to set it, which is what this does: open
   every closed disclosure when the browser announces a print, and put
   each one back exactly as it was when the dialog closes.

   RESTORED RATHER THAN LEFT OPEN, and that is the whole reason this
   keeps a list rather than calling querySelectorAll twice. Somebody
   who prints the questions page and then carries on reading it should
   find it as they left it; a screen silently reorganised by a print
   dialog is a screen that has lost the reader's place.

   `afterprint` does not fire everywhere — older WebKit is the known
   gap — so the restore also runs off the print media query, which
   flips back at the same moment. Both paths are idempotent, by the
   `opened === null` rule below, so a browser that fires both expands
   once and restores once.

   TINY, AND IN THE ENTRY CHUNK DELIBERATELY. Printing is not a lazy
   route — it is a keyboard shortcut available on every screen, and a
   module fetched when Ctrl+P is pressed arrives after the dialog. The
   weight is a few hundred bytes against a pack that prints correctly.
   ============================================================ */

/** The disclosures this module opened, and must therefore close again. */
let opened = null;

/* IDEMPOTENT, AND THAT IS NOT A NICETY — it is the defect the smoke
   gate caught on the first run of this module.

   Chromium fires BOTH signals for one print: the print media query
   flips and `beforeprint` is dispatched. The first version recorded
   the closed disclosures on each call, so the second call recorded the
   set of things still closed — by then empty, because the first call
   had just opened all of them. `restore()` then had nothing to close,
   and a reader who printed the questions page was handed it back fully
   expanded with their place lost.

   `null` means "not printing"; an array means "we are inside a print
   and this is what we owe the reader back". The second expand sees an
   array and leaves it alone. */
function expand() {
  if (opened) return;
  /* Anything already open was open because the reader opened it, and
     is not ours to close afterwards. */
  opened = Array.from(document.querySelectorAll('details:not([open])'));
  for (const el of opened) el.open = true;
}

function restore() {
  if (!opened) return;
  for (const el of opened) el.open = false;
  opened = null;
}

/* ============================================================
   THE CONTROLS, TRANSPOSED INTO THEIR VALUES.
   ============================================================ */

/** Everything this module inserted, so afterprint can undo it exactly. */
let inserted = [];
/** Labels whose required marker was stripped, with the text to put back. */
let relabelled = [];

/* A date in the document's own voice. `<input type="date">` prints
   whatever the browser's locale decides — `01/31/2027` on a machine set
   to US English — which on a Kenyan operator's pack is both wrong and
   ambiguous against 31/01. Written out in full, a date cannot be read
   two ways. */
function printableDate(value) {
  const at = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(at.getTime())) return value;
  return at.toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  });
}

/** What a control is worth, as the words that should appear on paper. */
function valueOf(el) {
  if (el instanceof HTMLSelectElement) {
    const option = el.selectedOptions[0];
    /* A placeholder option — "Select", "Not assessed" — carries no
       value, and printing it would assert an answer nobody gave. */
    return option && option.value ? option.textContent.trim() : '';
  }
  if (el instanceof HTMLTextAreaElement) return el.value.trim();
  if (el instanceof HTMLInputElement) {
    if (el.type === 'date') return el.value ? printableDate(el.value) : '';
    if (el.type === 'checkbox' || el.type === 'radio') return '';
    return el.value.trim();
  }
  return '';
}

function transpose() {
  if (inserted.length || relabelled.length) return;

  /* A REQUIRED MARKER IS AN INSTRUCTION, NOT A FACT. "Accountable post
     *" tells somebody at a keyboard that they cannot submit without
     it; on a printed record the asterisk is a footnote mark pointing
     at nothing. Stripped here rather than in CSS because it is written
     into the label's own text, where no selector can reach it. */
  for (const label of document.querySelectorAll('.field-label')) {
    const text = label.textContent;
    if (!/\s\*\s*$/.test(text)) continue;
    relabelled.push([label, text]);
    label.textContent = text.replace(/\s\*\s*$/, '');
  }

  for (const el of document.querySelectorAll('select, textarea, input')) {
    if (el.type === 'hidden' || el.type === 'file' || el.type === 'password') continue;

    /* A CHECKED BOX IS THE ANSWER; THE OTHER FOUR ARE THE QUESTION.
       The culture survey printed 70 empty radio buttons over six pages
       — the blank questionnaire, on the sheet whose own copy says the
       responses are not on it. An option nobody chose is marked so the
       stylesheet can drop the row entirely. */
    /* AN OPEN QUESTION, ON THE RECORD RATHER THAN DECIDED QUIETLY.

       Below, a text or select field that is EMPTY AND REQUIRED keeps
       its rule, because "there the absence is the finding". This branch
       returns before that rule is reached, so an unanswered radio group
       loses every row and the question disappears from the page — a
       reader cannot tell it from a question that was never asked.

       That is correct for the culture survey, which is why it was
       written this way: the unanswered questionnaire is exactly what
       must not print. It is NOT obviously correct for a required
       group on an assessment, where the gap is what an auditor came
       to find.

       MEASURED BEFORE WRITING THIS: there are zero `required` radios
       in `apps/web/src` today, so nothing is currently lost and this
       is latent rather than live. Left as it is deliberately —
       widening a printing rule by inference from a case that does not
       exist is how a rule stops meaning anything, which is the same
       argument `tests/filing-rights.test.ts` records about the
       permission matrix. Whoever adds the first required radio group
       to a deliverable settles it. */
    if (el.type === 'radio' || el.type === 'checkbox') {
      const row = el.closest('label, .mat-option, .chip, li') ?? el.parentElement;
      if (row) {
        row.dataset.printChoice = el.checked ? 'chosen' : 'unchosen';
        inserted.push({ kind: 'choice', row });
      }
      continue;
    }

    const value = valueOf(el);

    /* AN EMPTY OPTIONAL FIELD IS NOT A GAP, SO IT IS NOT ON THE PAGE.
       "Assessor notes" with nothing in it printed its heading and a
       rule under it — a reader is told a field exists and that nobody
       used it, which is true of most optional fields on most records
       and worth saying about none of them.

       An empty REQUIRED field keeps its rule, because there the
       absence is the finding: somebody has to answer it and has not.
       That distinction is the `required` attribute, which the form
       already carries, so nothing new has to be declared. */
    const field = el.closest('.field');
    if (!value && !el.required && field) {
      field.dataset.printOmit = 'yes';
      inserted.push({ kind: 'omit', field });
      continue;
    }

    const node = document.createElement(el instanceof HTMLTextAreaElement ? 'div' : 'span');
    node.className = value ? 'print-value' : 'print-value print-value--blank';
    node.textContent = value;
    el.insertAdjacentElement('afterend', node);
    el.dataset.printTransposed = 'yes';
    inserted.push({ kind: 'value', el, node });
  }
}

function untranspose() {
  for (const entry of inserted) {
    if (entry.kind === 'value') {
      entry.node.remove();
      delete entry.el.dataset.printTransposed;
    } else if (entry.kind === 'omit') {
      delete entry.field.dataset.printOmit;
    } else {
      delete entry.row.dataset.printChoice;
    }
  }
  inserted = [];
  for (const [label, text] of relabelled) label.textContent = text;
  relabelled = [];
}

export function watchForPrint() {
  window.addEventListener('beforeprint', prepare);
  window.addEventListener('afterprint', teardown);

  /* The fallback for an engine that never fires `afterprint`. Safari
     has historically fired neither; matchMedia('print') changes on
     both edges there, so this covers the open as well as the close. */
  const printing = window.matchMedia?.('print');
  printing?.addEventListener?.('change', (event) => {
    if (event.matches) prepare();
    else teardown();
  });
}

/* Both halves, in the order paper needs them: disclosures open first so
   the controls inside them are reachable, then the transposition. */
function prepare() {
  expand();
  transpose();
}

function teardown() {
  untranspose();
  restore();
}
