/* ============================================================
   Safe HTML templating

   Ported verbatim from the sibling product, where it was written to
   close an audit finding. It matters more here than it did there: that
   product's free-text surface was a company name and a note, and this
   one's is a safety narrative — up to 20,000 characters, typed by a frontline
   reporter, rendered in a triage queue, an investigation view, a
   de-identified bulletin circulated to other operators, and a PDF sent
   to the regulator. One unescaped interpolation is stored XSS with five
   audiences, and the person it fires at is a safety investigator
   reading a report they were told was safe to open.

   So the default is escaped and the opt-out is loud.

   Usage:
     el.innerHTML = html`<h1>${userInput}</h1>`;         // escaped
     el.innerHTML = html`<div>${raw(trustedSvg)}</div>`; // opt-out
     html`<ul>${items.map(i => html`<li>${i}</li>`)}</ul>`

   `html` returns a SafeHtml (a String subclass), not a plain string, so
   that a nested template is recognised as already-escaped rather than
   escaped a second time. Assigning one to `innerHTML` coerces it via
   toString, so call sites need no ceremony.

   Plain strings are always escaped — including plain strings returned
   from a nested function. If you build markup by hand, wrap it in raw()
   and take responsibility for it.
   ============================================================ */

class SafeHtml extends String {}

const ENTITIES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
};

/** Escape a value for HTML text or a quoted attribute. */
export function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (c) => ENTITIES[c]);
}

/**
 * Mark a string as already-safe markup, exempting it from escaping.
 * Only pass author-controlled strings — never user input.
 */
export function raw(value) {
  return new SafeHtml(value === null || value === undefined ? '' : String(value));
}

export function isSafe(value) {
  return value instanceof SafeHtml;
}

function resolve(value) {
  if (value === null || value === undefined || value === false) return '';
  if (value instanceof SafeHtml) return value.toString();
  if (Array.isArray(value)) return value.map(resolve).join('');
  return escapeHtml(value);
}

/** Tagged template that escapes every interpolation by default. */
export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) {
    out += resolve(values[i]) + strings[i + 1];
  }
  return new SafeHtml(out);
}

/** Escape a value for use inside an inline style or custom property. */
export function cssSafe(value) {
  return String(value ?? '').replace(/[^a-zA-Z0-9#(),.%\-\s/]/g, '');
}
