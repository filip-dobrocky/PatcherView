# pd4git

Browser extension (Chrome + Firefox) that shows Pure Data `.pd` patches as graphs on GitHub, gitlab.com and Codeberg file pages. A **Patch | Text** toggle switches back to the source view, and the choice is remembered. Click a subpatch to open it.

On commit and pull/merge request pages, changed `.pd` files get a **Diff** view: one canvas with added objects and cords in green, edited ones in amber (dashed if only moved), removed ones as red ghosts. Objects are matched by text, cords and position, so the renumbered `#X connect` lines that clutter text diffs don't show up as changes.

Self-hosted GitLab, Forgejo/Gitea or GitHub Enterprise: add the site on the extension's options page. The browser asks for permission for that site only.

```bash
npm install
npm test             # renderer tests
npm run dev          # Chromium with the extension loaded
npm run dev:firefox
npm run build        # dist/chrome, dist/firefox + zips
```

Requires Node ≥ 22.12 (extension.js).

## Known limits
- Inlet/outlet counts come from a small table of vanilla objects in `src/pd.js`. Abstractions and externals only show the iolets that are connected.
- Graph-on-parent subpatches and arrays render as a labelled frame. Array data is plotted assuming a -1..1 range.
- No Max patches.
- GitHub pull requests: the base/head commits are read from the classic Files changed page; GitLab and Forgejo/Gitea use the forge's API (same-origin, your session).
- Diff matching is heuristic (unique-text anchors, then neighbours along cords, then best text/position score, after [pure-diff-viewer](https://github.com/chsh2/pure-diff-viewer)). An object that's both retyped and moved far shows as removed + added.
- On custom sites the forge is guessed from the URL (`/-/blob/`, `/blob/` or `/src/`), and the page selectors are the ones used on gitlab.com, github.com and Codeberg.

## Credits
Patches are parsed with [@webpd/pd-parser](https://github.com/sebpiq/WebPd_pd-parser) (LGPL-3.0, from WebPd by Sébastien Piquemal and Chris McCormick). Geometry follows the [Pure Data](https://github.com/pure-data/pure-data) sources.

## License
GPL-3.0-or-later, see [LICENSE](LICENSE).
