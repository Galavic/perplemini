# Local Central Icons

This directory contains selected SVGs supplied in the local ClyraADE checkout.
The source files are copied without changing their geometry; `glyphs.json`
provides React-safe path attributes with theme colors set to `currentColor`.

- Collection: Central Icons, round outlined, radius 2, stroke 1.5.
- Source checkout: `ClyraADE/crates/ui/assets/central-icons`.
- Upstream extraction provenance: see `SOURCE.md`.
- Selected assets, original glyph names, hashes and UI aliases: `manifest.json`.
- Collection terms: https://iconists.co/license.

These third-party assets are not covered by Perplemini's MIT license. Their
presence in the source checkout does not establish a license for redistribution.
No license key or application bundle is copied into this project.

The available subset uses a pin for saved items, a folder for the library,
a document for academic publications, a globe for nature and exploration, and
the collection's widget glyph for science topics. No replacement geometry is
drawn or presented as an unavailable Central glyph.

To repeat the import from the sibling checkout:

```sh
python scripts/import-local-central-icons.py
```
