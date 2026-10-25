# Figma — "Small Africa — UI"

File: https://www.figma.com/design/GMM3GijPaKNRKhMYksZAV1

## What is in the file

| Page | Contents |
|---|---|
| Style Guide | Variables, text styles, and a `Components (main)` frame holding Logo/Crest, Button (Style × State), Input (State), Badge (Kitchen), Dish Card |
| Screens — Customer | (pending) desktop 1440 + mobile 390 frames |
| Screens — Admin | (pending) admin dashboard, menu manager, orders |

The Starter plan allows only 3 pages, so desktop and mobile frames share one page, side by side.

### Variables

- **Primitives** (hidden from pickers): `brand/obsidian … brand/smoke`. Web code syntax is `var(--obsidian)` and so on.
- **Theme** (semantic aliases): `color/bg/*`, `color/text/*`, `color/accent/*`, `color/border/*`.
- **Dimensions**: `spacing/1…32` (4–128px) and `radius/none|sm|md|lg|full`.

### Text styles

Display, Heading/H1–H4, Body/Large|Default|Small, Label/Button|Overline|Price, Accent/Script.

`state.json` holds the node and variable IDs needed to resume the build.

## Plan limits hit on 2026-10-25

The Figma Starter plan's MCP tool-call limit was reached after foundations and components were built.
`style-guide-board.js` holds the next script; run it through the Figma MCP `use_figma` tool once calls are available again.
