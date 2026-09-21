/* ============================================================
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

export function watchForPrint() {
  window.addEventListener('beforeprint', expand);
  window.addEventListener('afterprint', restore);

  /* The fallback for an engine that never fires `afterprint`. Safari
     has historically fired neither; matchMedia('print') changes on
     both edges there, so this covers the open as well as the close. */
  const printing = window.matchMedia?.('print');
  printing?.addEventListener?.('change', (event) => {
    if (event.matches) expand();
    else restore();
  });
}
