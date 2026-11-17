# pd4git

Browser extension (Chrome + Firefox) that shows Pure Data `.pd` patches as graphs on GitHub, gitlab.com and Codeberg file pages. A **Patch | Text** toggle switches back to the source view, and the choice is remembered. Click a subpatch to open it.

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
- No diffs, self-hosted GitLab/Forgejo, or Max patches yet.

## Credits
Patches are parsed with [@webpd/pd-parser](https://github.com/sebpiq/WebPd_pd-parser) (LGPL-3.0, from WebPd by Sébastien Piquemal and Chris McCormick). Geometry follows the [Pure Data](https://github.com/pure-data/pure-data) sources.

## License
GPL-3.0-or-later, see [LICENSE](LICENSE).
