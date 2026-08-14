# Brand masters

The artwork as the designer produced it. **Nothing in this directory is
served to a user**, and that is the point of the directory existing.

## Why they are not in `apps/web/public/`

They were, for one commit. Vite copies `public/` verbatim into `dist/`,
so 3.7 MB began being served on the next deploy — fourteen times the
weight of everything else in that directory combined, on a product whose
promise is a ramp agent at a remote strip with one bar of signal.

Nothing in the repository could see it. The bundle budget in
`scripts/stamp-sw.mjs` measures JavaScript and CSS and has never looked
at an image. And the offline install escaped by luck rather than by
design: the service worker precaches by extension —
`js|css|woff2|svg|png|json|html` — and these arrived from WhatsApp named
`.jpg`. Three of the eight are PNG data wearing that extension, so
renaming one to what it actually is would have added it to the bundle
every user downloads on install, silently.

`npm run check:assets` is the gate that closes it: every file under
`public/` is declared with a reason and a size ceiling, the directory has
a total budget, and a filename that looks like a master here fails with
an explanation. Mutation-checked three ways.

## What is here

| File | What it is | Where it belongs |
|---|---|---|
| `lockup-wide.jpg` | Horizontal lockup, *Aviation Safety, African Roots*, 1536×864 | LinkedIn banner, deck covers |
| `splash-portrait.jpg` | Shield over the savannah at sunset, *Safety Born of African Soil*, 864×1536 | Social, phone wallpaper, poster |
| `status-coins.jpg` | The six status coins, embossed, 1536×1152 | Guidelines, decks. **Preferred over the flat version** |
| `status-coins-flat.jpg` | The same six, flatter treatment, 1536×1152 | Superseded; kept because it is the version the guidelines page shows |
| `crane.png` | The grey crowned crane, 1024×1024 | Editorial, deck sections |
| `patterns-contact-sheet.png` | The four grounds — bogolanfini, Ethiopian cross, Rift contours, Maasai shuka — as one **captioned sheet**, 1024×1024 | Reference only. See below |
| `guidelines-spread.jpg` | Photographed spread of the brand guidelines | Documentation |
| `slide-template.png` | Title-slide template, "YOUR SUBTITLE GOES HERE" | Decks |

## The palette is already in the code, and it matches

The six colours on the guidelines page are the six tokens in
`apps/web/src/style.css`, unaltered:

| Guidelines | Token | Carries |
|---|---|---|
| `#C65D3B` Deep Terracotta | `--us-terracotta` | Identity, warm surfaces |
| `#D4AB43` Savannah Gold | `--us-gold` | The mark, highlights, TOLERABLE |
| `#2A7A7B` Aviation Teal | `--us-teal` | Action, links, sync |
| `#2C2C2C` Dusty Charcoal | `--us-charcoal` | Ink, primary text |
| `#F5F0E8` Warm Sand | `--us-sand` | Ground, sunk surfaces |
| `#BB321A` Ochre Red | `--us-ochre` | Alert, INTOLERABLE risk |

`npm run check:brand` asserts every foreground against every ground it
sits on, so the palette cannot drift out of contrast.

## The coins are not the status badges, and that is deliberate

The obvious move is to render `status-coins.jpg` where the product shows
SAFE / CAUTION / ALERT / OFFLINE / SYNCING / PROTECTED. It is the wrong
move, for three reasons that all point the same way:

- **The size the product uses destroys them.** A status badge sits
  inline in a queue row at around 20px tall. The border motifs — the
  Adinkra ring, the Ethiopian triangles, the puzzle interlace — are the
  whole character of these coins, and at that size they are mud. The
  artwork is beautiful at deck size and unreadable at badge size.
- **They cost bytes on the wrong screens.** Six coins, retina, even
  aggressively compressed, is 40–60 KB on the reporting queue — a screen
  reached over the connection this product exists to respect. The
  current badge is markup and two CSS rules.
- **Colour must never carry state alone.** The badge renders the WORD
  next to the colour, which is what survives a monochrome print to a
  regulator and what a screen reader announces. A coin with the word
  burned into the artwork is a picture of a label, not a label.

So the coins stay here, where they do what they were made for. If a
marketing site or a deck wants them, they are ready at full size.

## The patterns need a re-export before they can be used

`patterns-contact-sheet.png` is a **presentation sheet**: four tiles laid
out in a grid with captions underneath. It is not four assets. Using a
ground on a page needs each tile on its own and seamlessly tileable,
neither of which a crop of this sheet gives.

Worth asking for: the four grounds as individual seamless tiles, ideally
SVG. The app currently draws its own Ethiopian cross ground as an inline
SVG data URI in `offline.html` and `style.css`, which costs nothing and
tiles correctly — a raster would have to beat that on both counts.

## If you add anything here

Do not redraw a missing asset. An approximation ships, nobody queries
it, and the product ends up with two versions of its own identity. Where
an asset is absent, the surface uses type or the generated SVG mark in
`apps/web/public/icons/`, which is produced from `Logo.js` by
`scripts/build-icons.mjs` and cannot drift from the header.
