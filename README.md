# Anonymous dental articulation viewer

Interactive before/after comparison of 27 research inputs, with anonymous case
labels, synchronized rotation, fixed views and selectable saved results.

- GitHub Pages mirror: https://alfred-xu-cg.github.io/occlusion-results-viewer/
- Original site: https://occlusion-results-viewer.alfred-xu-entertainm.chatgpt.site/

This mirror serves the same static application, catalog and compressed STL bytes
as the original site. Meshes are not simplified, transforms are not recomputed,
and changing the host does not change the research results. Compare both links
on the same device/network to evaluate loading performance.

All runtime dependencies are vendored in `assets/`; Three.js licensing is retained
in `assets/THREE-LICENSE.txt`. Meshes load on demand for the selected case. A raw
mesh is shared across saved display poses rather than downloaded for each result.

This repository contains only the already published anonymous static viewer and
models. Patient-name mappings, source scans with original identifiers, original
STL headers, research directories, unpublished logs and credentials are excluded.
Anonymous labels do not guarantee irreversible anonymization of dental anatomy.
Do not use the viewer for identity inference or clinical decisions. The robots
and noindex directives request non-indexing; they do not restrict public access.

The `.nojekyll` file enables unchanged static-file publishing from the `master`
branch root. The `_headers` file is retained for byte correspondence with the
original distribution; GitHub Pages does not use it as a header configuration.
