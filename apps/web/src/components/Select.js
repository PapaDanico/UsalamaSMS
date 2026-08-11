/* ============================================================
   Select — the one dropdown in this product.

   STANDARDISATION IS THE POINT, and it works on two levels.

   The DATA level: every operational field with a bounded vocabulary
   reads from packages/shared/src/taxonomy.ts, so "HKJK", "JKIA" and "Nairobi" stop
   being three aerodromes. Without that, every safety-intelligence
   question is a GROUP BY over a column free text has already ruined.

   The INTERFACE level: every dropdown in the product is this function.
   One markup shape, one set of tokens, one focus treatment, one error
   state, one way to be labelled. A screen that hand-rolls its own
   select is a screen that will drift — different height, different
   focus ring, a label that is a <div> instead of a <label> — and the
   drift is invisible until someone tries to use it with a keyboard.

   NATIVE <select>, DELIBERATELY. A custom listbox would let us style
   the open menu, and it would cost: the OS picker on Android is a
   full-height sheet with a thumb-sized hit area and momentum scrolling
   that a div-based menu cannot match, it works with the system's own
   accessibility services, and it needs no JavaScript to open. The
   design target is a mid-range Android handset in sunlight. The native
   control wins that comparison on every axis that matters here.
   ============================================================ */

import { html, raw } from '../shared/html.js';

let seq = 0;

/**
 * @param {object} config
 * @param {string} config.name            Form field name.
 * @param {string} config.label           Visible label. Never omit it.
 * @param {Array}  config.options         [{ value, label, group? }]
 * @param {string} [config.value]         Currently selected value.
 * @param {string} [config.placeholder]   Text for the empty option.
 * @param {boolean}[config.required]
 * @param {string} [config.hint]          Help text under the control.
 * @param {string} [config.otherValue]    Value that reveals a free-text escape.
 * @param {string} [config.otherLabel]    Label for the escape option.
 * @param {string} [config.otherText]     Current free-text value.
 * @param {string} [config.otherPlaceholder]
 */
export function Select({
  name,
  label,
  options,
  value = '',
  placeholder = 'Select…',
  required = false,
  hint = '',
  otherValue = '',
  otherLabel = 'Not listed…',
  otherText = '',
  otherPlaceholder = 'Type it here'
} = {}) {
  const id = `sel-${name}-${++seq}`;
  const hintId = hint ? `${id}-hint` : '';

  /* Group when the taxonomy supplies categories. <optgroup> is the
     native affordance for this and costs nothing; twenty-three aircraft
     types in one flat list is a scroll, and the same list under
     Turboprop / Jet / Piston / Rotorcraft is a glance. */
  const groups = [];
  for (const option of options) {
    const key = option.group ?? '';
    let bucket = groups.find((g) => g.key === key);
    if (!bucket) groups.push((bucket = { key, items: [] }));
    bucket.items.push(option);
  }
  const grouped = groups.length > 1 || (groups[0]?.key ?? '') !== '';

  const optionMarkup = (option) => html`<option
    value="${option.value}"
    ${option.value === value ? raw('selected') : ''}
  >${option.label}</option>`;

  return html`
    <div class="field field--select" data-has-other="${otherValue ? 'true' : 'false'}">
      <label class="field__label" for="${id}">
        ${label}${required ? html`<span aria-hidden="true"> *</span>` : ''}
      </label>

      <div class="select">
        <select
          id="${id}"
          name="${name}"
          class="select__control"
          ${required ? raw('required') : ''}
          ${hintId ? raw(`aria-describedby="${hintId}"`) : ''}
        >
          <!-- An explicit empty option rather than a pre-selected first
               entry. A dropdown that opens already showing "Nairobi /
               Jomo Kenyatta" collects that answer from everyone who did
               not look, and a confidently wrong aerodrome is worse for
               aggregation than a blank one. -->
          <option value="" ${value === '' ? raw('selected') : ''}>${placeholder}</option>

          ${grouped
            ? groups.map((group) =>
                group.key
                  ? html`<optgroup label="${group.key}">${group.items.map(optionMarkup)}</optgroup>`
                  : group.items.map(optionMarkup)
              )
            : options.map(optionMarkup)}

          ${otherValue
            ? html`<option value="${otherValue}" ${value === otherValue ? raw('selected') : ''}>
                ${otherLabel}
              </option>`
            : ''}
        </select>
        <!-- The chevron is decorative; the native control already
             announces itself as a combobox. -->
        <span class="select__chevron" aria-hidden="true"></span>
      </div>

      ${hint ? html`<span class="field__hint" id="${hintId}">${hint}</span>` : ''}

      ${otherValue
        ? html`<input
            class="select__other"
            name="${name}Other"
            value="${otherText}"
            placeholder="${otherPlaceholder}"
            maxlength="120"
            ${value === otherValue ? '' : raw('hidden')}
            aria-label="${label} — not listed"
          />`
        : ''}
    </div>
  `;
}

/**
 * Reveal the free-text escape when its sentinel is chosen.
 *
 * Delegated from a container so it survives re-renders and covers
 * selects that did not exist when this was called. A per-element
 * listener bound at render time is how a dynamically added dropdown
 * ends up with a dead escape hatch.
 */
export function wireSelects(root) {
  root.addEventListener('change', (event) => {
    const select = event.target.closest?.('.select__control');
    if (!select) return;

    const field = select.closest('.field--select');
    const other = field?.querySelector('.select__other');
    if (!other) return;

    // The sentinel is whatever the last option carries — read from the
    // DOM rather than passed in, so the component and its behaviour
    // cannot disagree about which value means "not listed".
    const sentinel = field.querySelector('option[value^="__"]')?.value;
    const show = Boolean(sentinel) && select.value === sentinel;

    other.toggleAttribute('hidden', !show);
    if (show) other.focus();
    else other.value = '';
  });
}
