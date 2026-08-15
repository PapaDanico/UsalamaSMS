# UsalamaSMS — Brand Implementation

How the supplied identity is encoded in the app. Everything below lives
in `apps/web/src/style.css` (tokens), `apps/web/src/components/Logo.js`
(mark and lockup) and `scripts/check-brand.mjs` (the gate that keeps it
honest).

Where this file and the brand guidelines disagree, the guidelines win —
with one class of exception, stated up front rather than buried: **where
a guideline combination cannot be read, it is not reproduced.** Two such
combinations exist and both are documented below with the measurement
that condemned them. Neither is a licence to alter a brand colour; every
fill in this product is the exact specified value.

---

## Palette — the six-colour system

| Name | Token | Value | Use |
|---|---|---|---|
| Deep Terracotta | `--us-terracotta` | `#C65D3B` | Identity, warm surfaces. **Never on the risk scale** |
| Savannah Gold | `--us-gold` | `#D4AB43` | The mark, highlights, the TOLERABLE risk step |
| Aviation Teal | `--us-teal` | `#2A7A7B` | Action, links, focus ring, sync state |
| Dusty Charcoal | `--us-charcoal` | `#2C2C2C` | Ink, primary text |
| Warm Sand | `--us-sand` | `#F5F0E8` | Ground, sunk surfaces |
| Ochre Red | `--us-ochre` | `#BB321A` | Alert, the INTOLERABLE risk step |

These are **fills**. They were chosen to be seen, not to be read.
Measured on white:

| Colour | On white | On Warm Sand | Verdict as body text |
|---|---|---|---|
| Savannah Gold | 2.16:1 | 1.91:1 | A gold caption is a rumour of a caption |
| Deep Terracotta | 4.17:1 | 3.68:1 | Under the 4.5:1 floor |
| Aviation Teal | 5.04:1 | 4.44:1 | Passes on white, **fails on sand** |
| Ochre Red | 5.86:1 | 5.16:1 | Passes |

So four darkened siblings exist, used **only where the colour becomes
type**:

| Token | Value | On white | On sand |
|---|---|---|---|
| `--us-terracotta-text` | `#A8431F` | 6.02 | 5.31 |
| `--us-gold-text` | `#7A5C12` | 6.24 | 5.50 |
| `--us-teal-text` | `#20605F` | 7.24 | 6.38 |
| `--us-ochre-text` | `#A32A14` | 7.24 | 6.39 |

Every one clears 5.3:1 on **both** grounds, so a token cannot be moved
from a white card to a sand panel and quietly drop under the floor. This
is the trap the sibling product fell into and fixed the same way.

Brand colour at partial alpha goes through `--us-sand-rgb`,
`--us-charcoal-rgb`, `--us-teal-rgb` and `--us-gold-rgb` rather than a
literal `rgba()` — a hardcoded `rgba()` is invisible to a token sweep,
which is how ten hairlines carried a stale cream through the sibling
product's last
repaint.

---

## The two combinations from the artwork that are not reproduced

### 1. White "CAUTION" on Savannah Gold — 2.16:1

The status badge sheet sets white type on the gold CAUTION disc. That is
2.16:1 against a 4.5:1 floor, and it is the badge most likely to be read
in daylight on a ramp. **Gold carries Dusty Charcoal here** (6.45:1).
Nothing about the gold changed.

`scripts/check-brand.mjs` asserts this pairing by name so the regression
has its own line in the output.

### 2. Deep Terracotta beside Ochre Red — 1.40:1 against each other

The two reds sit about eight degrees apart in hue. Adjacent, they are
one colour. Since a Doc 9859 matrix puts tolerability bands next to each
other by construction, **Deep Terracotta is forbidden anywhere on the
risk scale** — asserted by name in the gate, not left as guidance.

Terracotta remains fully in use for identity, surfaces and the
categorical chart series. It simply does not get to mean "nearly
intolerable".

---

## The risk scale, and why the green is almost black

The tolerability scale is three steps and it is **not a brand palette**.
The benchmark's rule is that categorical colours must never signal good or bad;
this product needs the inverse rule, because here the colours do mean
something and the six-colour system cannot express it.

| Step | Token | Value | Foreground | Source |
|---|---|---|---|---|
| INTOLERABLE | `--us-risk-intolerable` | `#BB321A` | white, 5.86:1 | Brand, unaltered |
| TOLERABLE | `--us-risk-tolerable` | `#D4AB43` | charcoal, 6.45:1 | Brand, unaltered |
| ACCEPTABLE | `--us-risk-acceptable` | `#08301C` | white, 14.48:1 | **Deliberately not a brand colour** |

The six-colour system contains no green. Inventing a seventh brand
colour would have been the wrong repair: this colour means one thing, it
means it in every product, and it must never drift toward whatever the
brand does next.

**Three drafts, two of them rejected by the gate.**

*Draft one* used a mid green, `#1F7A4D` — the obvious choice. It is
**1.10:1 against Ochre Red**. The two sit at nearly identical luminance,
so in greyscale, on a fax to a regulator, and to a reader with a
protan deficiency, ACCEPTABLE and INTOLERABLE were the same cell. That
is the single worst confusion this product could ship, and it looked
completely fine on screen.

*Draft two* was the textbook repair: a monotonic light ramp, severity as
darkness — pale green, gold, deep red. It fails differently. A pale
green that clears Savannah Gold by any useful margin lands at
**1.06:1 against Warm Sand**. The ten ACCEPTABLE cells stopped being
cells and became page.

*Draft three*, shipped: the ramp runs the other way and the green goes
dark. Worst real pair 2.47:1; worst pair after dichromacy simulation
1.78:1. The cost is a heavier matrix than convention leads you to
expect, and Savannah Gold ends up the lightest of the three — which
inverts the usual severity-as-weight reading. TOLERABLE takes a darker
border to claw some of that back, and the letter code does the rest.

**Why the floors are 2.4 and not 3.0.** Three fills cannot all clear
3:1 against each other inside a light palette; the available luminance
range will not carry two 3:1 steps. Asserting 3.0 would assert something
no palette can satisfy, and a floor that can only be met by deleting the
check is not a floor. The gate asserts 2.4:1 between fills and 1.7:1
between fills after protanopia, deuteranopia and tritanopia simulation.
Both rejected drafts one and two.

**Colour is never the only channel.** Every risk chip and matrix cell
carries the tolerability word and the numeric index, and cells carry a
one-letter code. WCAG 1.4.1, and also just: printed in greyscale it
still says what it is.

---

## Light only — the deviation from both sibling products

JK & Associates resolves every brand colour through a
light/dark pair. This product ships one scheme.

It is read on a phone at a border post at night and needs dark mode.
UsalamaSMS is read in a cockpit, a hangar office and a regulator's
meeting room — and a safety report that renders differently depending on
an OS setting is a safety report two people can describe differently.
One scheme, one rendering, one printed output.

The useful side effect is half the contrast surface to keep correct. The
gate asserts its own assertion count, so a scheme quietly reintroduced
without doubling the sweep fails the build.

---

## Typography

One family, the documented weights, self-hosted:

| Weight | Role |
|---|---|
| Bold 700 | Wordmark, headlines, emphasis |
| Semi 600 | Interface chrome, chips, table headers |
| Medium 500 | Sub-headings, callouts |
| Regular 400 | Body copy, captions, data |

`font-variant-numeric: tabular-nums` on the body, which matters more here
than on a marketing site: risk indices, SPI values and report references
are read in columns and compared down the column.

**DM Sans is the stand-in, and it is the JK & Associates platform's own
face.** Usalama was set in Inter — a defensible choice made before there
was a house face to align with, and the wrong one once there was: two
products under one corporate banner set in two different sans read as two
vendors. The brand's licensed geometric sans is still not in this
repository, so DM Sans remains a stand-in; it is now the same stand-in the
sibling product uses.

It ships as **one variable file covering 400 to 700**, not four statics.
The four weights above are stops on an axis rather than four downloads,
which is both smaller (63 KB against 96 KB) and the only arrangement that
cannot drift: four static files can silently become four copies of one, and
in the sibling product they had.

**A declared weight range is load-bearing.** `font-weight: 400 700` on the
`@font-face` is what tells the browser to instance the axis. Declare a
single weight on a variable file and every rule asking for bold gets a
*synthesised* one — a smeared regular with the wrong metrics, which looks
close enough at screenshot size to pass review. `npm run smoke` measures
rendered widths at 400, 500, 600 and 700 and fails unless each is strictly
wider than the last, which no synthesis can satisfy.

Faces are self-hosted and same-origin — no font CDN, and smoke counts every
off-origin request during load. When the licensed family arrives, replace
the two `@font-face` sources in `apps/web/src/fonts.css` and nothing else
changes; no call site names a family directly. Recorded in
`docs/05-SWITCHES.md`.

---

## The mark

**The mark is cropped from `docs/brand/lockup-wide.jpg`. Nothing draws
it.** `scripts/build-icons.mjs` is the only thing that touches it, and
`apps/web/src/components/Logo.js` renders what that produces. Never
hand-edit an icon — change the crop and regenerate.

### Why it is a crop and not a drawing

It used to be a drawing. `Logo.js` carried the geometry — a shield, a
crane in five pieces, two arcs, three runway bars and an aircraft on a
120×140 grid — and `build-icons.mjs` read those same constants, so the
favicon could not disagree with the header.

That worked, and it solved the wrong problem. One source kept the
favicon and the header agreeing **with each other**; it could not make
either agree with the identity, and neither did. Side by side with the
artwork the drawing has straight crossing lines where the mark has
sweeping contrail arcs, an arrowhead where it has an airliner, and a
spiked crest where it has a rounded one. A competent redrawing, and
visibly not the mark.

### The supplied artwork disagrees with itself

This has to be known before "match the brand assets" means anything.
`docs/brand/` holds four renderings and no two match:

| File | The mark it shows |
|---|---|
| `guidelines-spread.jpg` | Quartered colour shield, straight crossing lines, crane, aircraft — captioned PRIMARY LOGO |
| `lockup-wide.jpg` | Gold line art, curved contrail arcs, an airliner, crane on a runway |
| `splash-portrait.jpg` | Gold line art, crane at the **top**, **two** aircraft, runway in perspective |
| `slide-template.png` | Gold line art on cream, different again |

So the rule is **pick one and use only it**, and the pick is
`lockup-wide.jpg` on three grounds rather than preference:

- it carries the mark at the largest clean size of the four — 330×425
  against `slide-template`'s 240×275;
- it is a flat render, not a photograph of a printed page, so there is
  no perspective, paper grain or page curl to key through;
- its ground is a flat-ish pattern rather than a gradient, and a
  gradient cannot be keyed away without keying away the mark.

**If a replacement master ever arrives, this is the decision to revisit
first** — preferably as a vector, which would remove the whole crop
pipeline.

### How the crop is made

Every pixel is snapped to one of two brand tokens — gold where the mark
is, ground where it is not — which is what removes the terracotta
pattern behind it. The key runs at **4×** and the result is downscaled:
keying at the target size would snap away the antialiasing too and leave
hard stair-steps. Separate where there are pixels to spare, smooth
afterwards.

The ramp is then quantised to 16 levels. That is a weight decision, not
a visual one: a tile that is two colours to look at is thousands to
encode, and the cropped set first came in 38 KB heavier than the flat
SVGs it replaced — enough to put `public/` over budget on a product
whose promise is a ramp agent at a remote strip.

### The variants

| File | Treatment | Where |
|---|---|---|
| `favicon-32.png` | Gold on charcoal, near full bleed | Browser tab |
| `icon-192/512.png`, `apple-touch-icon.png` | Gold on charcoal, mark at 80% | Installed app |
| `maskable-512.png` | Gold on charcoal, inset to clear the mask | Android |
| `mark-light-128.png` | Charcoal on transparent | Header and footer lockup |
| `mark-dark-256.png` | Gold on transparent | The dark hero band |

**Two in-app files because there are two grounds**, and both are the
monochrome variants the guidelines list. Gold on Warm Sand is two light
values against each other; charcoal on the charcoal footer is a mark you
cannot see — which is what shipped into a build once, so a smoke check
now screenshots each rendered mark and measures the contrast inside it.

- **No SVG anywhere in the icon suite.** There is no vector master, so
  an SVG could only be a redrawing. There were four; one sat in the
  manifest beside its own PNG, and a browser preferring the vector saw a
  different logo from one preferring the raster. `tests/favicon.test.ts`
  fails if one reappears.
- **No detail threshold any more.** The drawing dropped the crest, the
  runway and the arcs below 40px because sub-pixel strokes smear. A
  raster does not need to — the 4× key and downscale hand small sizes an
  antialiased result. Where a size genuinely cannot carry the detail,
  the answer is a tighter crop, not less drawing.
- **The mark is never rendered in risk-scale colours.** A logo that
  turns red is a logo that looks like an alert.
- **The mark is never rendered in risk-scale colours.** A logo that turns
  red is a logo that looks like an alert.
- **The wordmark is live text**, not traced letterforms: crisp at any
  size, reflows, selectable, searchable, and it inherits the licensed
  face the day it arrives.
- **The lockup's accessible name covers the whole thing.** The mark is
  explicitly `aria-hidden` and the adjacent text does the naming — a
  screen reader announcing "UsalamaSMS" twice is the accessible-name
  defect a first Lighthouse run found on the sibling product's own logo.

---

## Dropdowns — one component, one vocabulary

Every operational field with a bounded set of answers is a dropdown, and
every dropdown in the product is `components/Select.js` reading a list
from `data/taxonomy.js`. That is two kinds of standardisation and the
first one matters more than it looks.

**The data.** `location` and `aircraftType` were free text. "HKJK",
"JKIA", "Nairobi" and "Jomo Kenyatta" are one aerodrome to a human and
four to a `GROUP BY` — so every safety-intelligence question worth
asking (which aerodrome accumulates runway-excursion precursors, which
type is over-represented in fatigue reports) was already unanswerable at
the point of data entry. Under Annex 19 Amendment 2 that is a compliance
concern rather than a preference: Doc 10159 describes a pipeline from
data to decision, and a pipeline over uncontrolled strings carries
nothing.

**The interface.** One markup shape, one height, one focus ring, one
error state, one way of being labelled. A screen that hand-rolls its own
`<select>` drifts, and the drift is invisible until somebody uses it
with a keyboard. `scripts/smoke.mjs` asserts that every `<select>` on
every route is `select.select__control`, so a hand-rolled one fails the
build.

**Native, deliberately.** A custom listbox would let us style the open
menu and would cost the OS picker — a full-height sheet on Android with
a thumb-sized hit area, momentum scrolling, and the system's own
accessibility services. The design target is a mid-range handset in
sunlight; the native control wins on every axis that matters here.

**Three rules the component enforces.**

1. *Every list carries an escape.* A vocabulary with no "not listed"
   option does not eliminate free text — it puts the real answer in the
   narrative where nothing can count it, and a wrong entry in the
   column. That is worse than free text, because it is free text plus a
   wrong number.
2. *Nothing opens pre-answered*, with one exception. A dropdown showing
   "Nairobi / Jomo Kenyatta" before anyone touches it collects that
   answer from everyone who did not look. Jurisdiction is the exception:
   it is a property of the operator, not of the event.
3. *Multi-select is not a dropdown.* The HRC categories stay as
   checkboxes. A native `<select multiple>` on a touch device needs a
   long-press or a modifier key to pick a second item; most people never
   find it, and those who do lose their first choice trying.

## Categorical colours are not risk colours

`--us-cat-1` … `--us-cat-6` distinguish series in a chart — HRC
categories, report types, departments. They carry **no semantic meaning**
and must never signal good or bad.

This was a live defect in the sibling product, worth restating because this product has
more opportunities to repeat it: the priority-findings chip took the
domain's categorical colour, so the single worst finding rendered green
whenever its category happened to be green. Here, anything reading
`--us-cat-*` to express severity is wrong by construction — the risk
tokens exist and are named for the job.

---

## Still needed

1. **The licensed geometric sans** (woff2 subsets). DM Sans — the JK &
   Associates platform face — is the documented stand-in.
2. **The master logo vector.** Not "if the artwork differs" — it does,
   and there is no vector at all, which is why every icon is a keyed
   crop of a 330×425 region of a JPEG. That is sufficient today because
   no icon draws the mark larger than 410px, and it is a ceiling: a
   1024px tile, a print asset or a cleanly recoloured variant all need a
   master. It would also settle which of the four supplied renderings is
   canonical, which is currently decided by `MARK_BOX` in
   `scripts/build-icons.mjs` rather than by anybody.
3. **A decision on the status-badge sheet.** The artwork's six badges
   (SAFE / CAUTION / ALERT / OFFLINE / SYNCING / PROTECTED) mix two
   different scales — operational sync state and safety state — in one
   visual system. They should not share a vocabulary: a report that
   failed to sync is not a hazard, and a user who learns to read the red
   disc as "danger" will misread it as "network". The tokens already
   separate them (`--us-state-*` versus `--us-risk-*`); the artwork does
   not.

---

## The slogan

**"Safety intelligence for African skies."**

It replaced *"Safety born of African soil"*, which was warm and did not
say what the product does.

Every word is load-bearing:

- **Safety intelligence** is the ICAO term. Annex 19 Amendment 2 makes
  it a formal provision on 26 November 2026 and Doc 10159 is the manual
  behind it. It is the thing this product is positioned on, it is what
  no incumbent was built for, and to a Director of Safety it is a
  recognised phrase rather than a marketing one.
- **African skies** keeps the origin without the soil metaphor. The
  operators this is for fly; they do not farm, and a product sold to a
  regulator reads better without a pastoral image attached.
- It is **forward-looking**, which "born of" is not: safety intelligence
  is what the platform accumulates, and the accumulation is the moat
  once the compliance-timing advantage expires. `docs/05-SWITCHES.md`
  switch 3 puts a date on that.

The identity's own banner uses *"Aviation Safety, African Roots"*, which
is a fine line for a LinkedIn header and a weaker one for a product:
"roots" describes where it came from, and the claim that matters is what
it does next.

---

## The ground texture

The identity ships four background textures. The app uses the
**Ethiopian cross tessellation**, redrawn as an inline SVG pattern — no
request, no raster, scales to any density.

It sits at **3.2% opacity** on Warm Sand and is fixed to the viewport.
That is the difference between a page with a ground and a page with a
background colour, and it is deliberately below the level where it
competes with a safety narrative for attention.

**The Bogolanfini mud-cloth grid was tried first and rejected on looking
at it.** Its dashes and chevrons tile into shapes the eye reads as small
repeated *glyphs*, and a page of faint repeated glyphs behind an incident
report is a page that fights the report. A radially symmetric motif does
not do that at any opacity — which is a property of the motif, not of
the value in the opacity field, and is why lowering the number was not
the fix.

Cards do not carry it: the texture is the ground, and the cards are the
things standing on it. It is removed entirely for print — a regulator's
copy is evidence, and evidence does not need decoration charged to their
toner.
