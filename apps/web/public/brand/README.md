# Brand assets

**This directory is the official home for the UsalamaSMS brand artwork.
It is currently empty of artwork, and that is a blocker rather than a
placeholder.**

The artwork exists — the status coins, the crowned crane, the horizontal
lockup and the four ground patterns were all designed and reviewed. What
it does not have is a copy in this repository. It has been shown in
conversation as images, which is not a file, and nothing in this product
will render an asset that has been described to it.

**Do not redraw them.** An approximation of a brand asset is worse than a
missing one: it ships, it looks close enough that nobody queries it, and
the product ends up with two versions of its own identity. If the file is
absent, the surface uses the existing SVG mark in `../icons/` or plain
type — never a lookalike.

## What belongs here, and under what name

The names are what the code will look for. Keep them exactly.

| File | What it is |
|---|---|
| `status-safe.png` | Green coin, shield with a tick, wordmark SAFE |
| `status-caution.png` | Ochre coin, shield with an eye, wordmark CAUTION |
| `status-alert.png` | Red coin, shield with a raised palm, wordmark ALERT |
| `status-offline.png` | Charcoal coin, shield with a crossed link, wordmark OFFLINE |
| `status-syncing.png` | Teal coin, shield with a refresh ring, wordmark SYNCING |
| `status-protected.png` | Terracotta coin, shield with a mask, wordmark PROTECTED |
| `crane.png` | The grey crowned crane, standing, on the sand ground |
| `lockup-wide.png` | Horizontal lockup: shield + wordmark + strapline, patterned ground |
| `pattern-bogolanfini.png` | Ground 1 — bogolanfini geometric grid |
| `pattern-ethiopian-cross.png` | Ground 2 — Ethiopian cross tessellation |
| `pattern-rift-contours.png` | Ground 3 — East African Rift topographic lines |
| `pattern-maasai-grid.png` | Ground 4 — Maasai shuka data grid |

Vector originals (`.svg`) are preferred over `.png` for the coins, the
crane and the lockup wherever they exist — the coins are rendered at
badge size on a handset and at print size on a register, and a raster at
one of those is wrong at the other.

## Before any of it is wired in

Two things have to be answered first, and neither is a design question:

1. **The bundle budget.** Six raster coins are the single largest thing
   this product would have added to the wire since the fonts. The rule in
   `scripts/stamp-sw.mjs` stands: a raise needs a receipt saying what was
   bought. The likely answer is that the coins are precached with the
   shell only if they are SVG and small, and are otherwise lazy.
2. **The contrast gate.** `npm run check:brand` asserts every foreground
   over every background it sits on. A wordmark burned into artwork is
   not a token pair the gate can read — so any coin used as a status
   badge keeps its text label in the markup, exactly as the current
   `.badge` does. Colour never carries the state on its own, and a coin
   is colour.
