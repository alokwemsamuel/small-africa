# Design assets

| Folder | What | How to rebuild |
|---|---|---|
| `logo/` | Final SA Monogram Crest: SVG (outlined), PNG 512/1024/2048, favicons, OG image | `cd tools && npm run logo` |
| `logo/concepts/` | The four original logo concepts and their preview board (`index.html`) | `cd tools && npm run concepts` |
| `brand/` | Brand guide (PDF), Instagram post & story (PNG), A4 menu card (PDF + PNG) | `cd tools && npm run brand` (needs Edge or Chrome) |
| `brand/src/` | Editable HTML sources for the brand assets, plus the original pattern and placeholder illustration | — |
| `figma/` | Figma file link, ID ledger and pending scripts | see `figma/README.md` |
| `fonts/` | OFL font files used for offline rendering | — |

Run `npm install` in `tools/` once before using the scripts.

## Replacing placeholder photos in templates

The post and story use an original plated-dish illustration until real photography exists.
To use a photo, add `class="photo has-photo"` and `style="--photo:url('my-dish.webp')"` to the `.photo` element, then run `npm run brand`.
Only use photos you own, or Unsplash/Pexels photos, and list any of those in `CREDITS.md`.

## Palette additions for accessibility

Two shades were added to the brief's palette so secondary and gold text pass WCAG AA on light backgrounds:

- `smoke-dark #665D55`: 5.6:1 on ivory (smoke `#8A8178` is only 3.3:1)
- `gold-dark #7D5E1F`: 5.3:1 on ivory (gold `#C9A24B` is only 2.1:1)
