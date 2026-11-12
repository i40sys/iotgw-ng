# IoT Gateway NG + Edge Manager — The Opportunity

Ten slides for a first business meeting with an automation integrator.
English content, English speaker notes, original **oriolrius.me** theme.

## Run

Requirements: Node.js 22.19 or later; pnpm 12.4.1.

```bash
cd slides
pnpm install --frozen-lockfile
pnpm dev
```

Open <http://localhost:3030>. Use the arrow keys or PageDown/PageUp to change slides.
Use the Slidev presenter view for speaker notes.

## Build and export

```bash
pnpm build
pnpm export
pnpm export:png
```

- Static deck: `dist/`.
- PDF: `exports/iotgw-ng-business.pdf`.
- Slide images: `exports/png/`.
- Export requires Chromium. The `playwright-chromium` install step downloads it.
- Fonts, icons, logo and portrait come from the theme. No online fonts are required.
- Generated output and dependencies stay outside version control.

## Edit

Edit `slides.md`. Each slide contains speaker notes in its final HTML comment.
Full outline titles remain in frontmatter or notes. Short visible headings keep the theme layout readable.
The chapter labels preserve the three groups without adding divider slides.

| Slides | Chapter |
|---|---|
| 01–03 | Understand the Product |
| 04–08 | Discover the Opportunity |
| 09–10 | Build Something Together |

Slide 10 presents a consulting and mentoring programme. Clients purchase guidance to adopt the platform, add a product offer to their catalogue and develop an internal team. Fees cover consulting and knowledge transfer. Numeric scope, price and duration stay outside the presentation and speaker notes.
Slides 03, 05–08 distinguish the MVP, proposed value and future services. No revenue, adoption, support or recovery guarantees appear in the deck.

## Theme

`slidev-theme-oriolrius` is pinned to `v0.1.0`; the lockfile records commit `4e0915eacb5fbac35e0038a6f637e9151821c3a5`.
Keep `shamefully-hoist=true` in `.npmrc` for theme dependency resolution.
Use the original [theme API](https://github.com/oriolrius/oriolriusme-slidev-theme#readme) for layout changes.
The canvas is 1920 × 1080. The deck uses theme layouts, fonts, colours and components directly.

## Content sources

- Slide 10 direction: owner’s follow-up on consulting, mentoring, product adoption and team autonomy.
- Original outline: `source/IoT_Gateway_NG_Deck_Reunion_Negocio.md`. Unchanged copy of the supplied file.
- Product: repository `../README.md`, `../sites/iotgw-commercial/i18n/en.json`, and [product website](https://iotgw.industry40.systems/en/).
- Recovery status: `../backlog/decisions/decision-037 - Gateway-backup-and-restore-with-Duplicati-to-S3-compatible-object-storage-replaces-the-Clonezilla-image-flow.md` (proposed).
- Slide 04: [Siemens manual](https://support.industry.siemens.com/cs/attachments/109781419/EdgeApp_PerfInsightenUS_en-US.pdf), [Matrikon FAQ](https://matrikon.com/downloads/faqs/), [Kepware products](https://www.velotic.com/products/kepware), [Ignition Edge](https://inductiveautomation.com/ignition/edge).

The complement column on slide 04 describes possible combinations. It does not claim tested integration. Check the exact product, OS, hardware and licence for each project.
