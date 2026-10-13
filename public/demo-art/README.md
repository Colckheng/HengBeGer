# Demo visual assets

These are presentation assets for the independent local UI prototypes. They do not replace the catalog data or its original thumbnails.

- The nine PNG illustrations were retrieved from the official miHoYo wiki APIs on 2026-10-08. Each image's CDN URL and official source page are recorded in `sources.json` and `src/demo/artworks.json`. Original character artwork remains the property of its respective rights holders.
- Currency role artwork is associated by matching HSR character ID and name, not by taking the first matching name. For example, role 1001 uses character 1001, not the separate 1224 variant of 三月七.
- `covers/` contains unchanged copies of the three desktop images selected by the user. The confirmed mapping is Anby birthday → ZZZ, March 7th bouquet → HSR, March 7th cake → Currency Wars. See `covers/sources.json` for source filenames, dimensions and hashes. The formal Open Index home presentation uses `object-fit: contain` and preserves the complete source image without cropping.
- `previews/` contains browser captures of the implemented homepages, lists and details, not separately designed mock images. Capture size is 1440 × 1000; the design review toolbar is hidden in the captures.
- `fonts/` contains Space Grotesk and subsets of Noto Sans SC / Noto Serif SC obtained from Google Fonts. Their corresponding SIL Open Font License files are included. The font files are served locally; the prototype does not request Google Fonts at runtime.

Image presentation uses CSS sizing and clipping; source PNGs are unmodified. Illustrations retain their aspect ratios, while small icons are kept within size limits. Missing or ambiguous matches continue to use the catalog thumbnail or the explicit missing-image placeholder. Formula and event entries use typographic marks rather than unrelated illustrations.
