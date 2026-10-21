# Central Icons control glyphs

These 111 SVG assets map ADE's interface controls to Central Icons from the
user's local Devin Desktop installation. They use the
`round-outlined-radius-2-stroke-1.5` variant: rounded corners with radius 2 and
an outlined 1.5px design on a 24x24 canvas. Outlines are encoded as filled path
contours by the source collection, not as SVG `stroke-width` attributes.

The assets are embedded locally and inherit existing control sizes and theme
colors. No Devin branding, React components or application code is included.

- Original collection: https://centralicons.com/
- Collection author and license: https://iconists.co/license
- Source: Devin Desktop 3.10.67, `resources/app/out/vs/workbench/windsurf-chat-client/index.js`
- Source bundle SHA-256: `8b0f6cd5361b1f5494749f6a457ab33b30f31374c7a7ae3388e637a98d7a18cc`
- Importer: `scripts/import-devin-desktop-icons.py`
- Mapping and per-asset source names: `manifest.json`

Only the selected control glyphs are included, rather than the full collection.
The importer reads and validates static path literals without executing the
source bundle. Original geometry is preserved; the selected star and fast-tier
states fill the same glyph's outer contour to retain their active-state meaning.
The collection's terms apply to these assets separately from the repository's
MIT license. This directory is not the complete Central Icons collection.

The generated aliases in `crates/ui/src/central_icons.rs` replace every generic
control path registered in `icons.rs`, including composer, transcript, settings,
queue, file controls and project actions. Provider brand marks, native window
caption controls, Clyra's logo, the Calesto logo and the colored file-identity
theme keep their own assets. The two Calesto status glyph paths use Central's
circle-check control.

Sidebar toggles alternate between Hidden Left Wide and Hidden Right Wide.
The left sidebar shows Hidden Left Wide while open and Hidden Right Wide while
closed; the right sidebar mirrors this pairing.
