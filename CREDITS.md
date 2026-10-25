# Credits & Licences

Every external asset used in Small Africa is listed here with its source and licence.

## Fonts (SIL Open Font License 1.1 — commercial use allowed)

| Asset | Source | Licence | Used in |
|---|---|---|---|
| Cormorant Garamond (SemiBold) | https://fonts.google.com/specimen/Cormorant+Garamond | OFL 1.1 | Headings, logo lettering (`design/fonts/`) |
| Manrope (Medium, SemiBold) | https://fonts.google.com/specimen/Manrope | OFL 1.1 | Body/UI, logo tagline (`design/fonts/`) |
| Italiana | https://fonts.google.com/specimen/Italiana | OFL 1.1 | Accent script |

On the website the fonts are self-hosted from the `@fontsource/cormorant-garamond`, `@fontsource-variable/manrope` and `@fontsource/italiana` npm packages (package code MIT, fonts OFL 1.1). Self-hosting avoids a third-party request to Google.

## Original artwork (created for this project)

| Asset | Notes |
|---|---|
| Small Africa logo (SA Monogram Crest) and the three unused concepts | Drawn from scratch as SVG by `design/logo/concepts/build.mjs` and `design/tools/export-logo.mjs`. No third-party marks or clip-art. |
| Favicons and Open Graph image | Generated from the logo by `design/tools/export-logo.mjs`. |

## Code libraries

All open-source under MIT, Apache-2.0, BSD or ISC licences. Full lists are in `frontend/package.json` and `backend/composer.json`. Main libraries: React, React Router, TanStack Query, React Hook Form, Zod, Tailwind CSS, Vite (MIT); Slim, Slim-Psr7, phpdotenv (MIT/BSD); PHPMailer (LGPL-2.1, used unmodified as a library).
