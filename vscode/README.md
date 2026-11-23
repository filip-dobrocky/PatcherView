# PatcherView

Shows Pure Data `.pd` and Max `.maxpat`, `.maxhelp`, `.gendsp` and `.rnbopat` patches as patches instead of text, and changes to them as one **Diff** canvas:

- added objects and cords in green
- edited ones in amber (dashed if only moved)
- removed ones as red ghosts

Objects are matched by text, cords and position, so the renumbered `#X connect` lines that clutter text diffs don't show up as changes.

## Usage

- **Open a patch:** it opens as a patch. **Text** reopens it in the text editor. Click a subpatch to open it.
- **Diffs:** changes opened from Source Control, Timeline or a commit compare show as one diff canvas. **Text** switches to the normal text diff.
- **Patch Diff** (editor title button): compares the open patch with HEAD.
- **Pd | Max** picks the drawing style (Max draws like Max 9's default dark theme), remembered separately for Pd and Max files.

## Settings

- `patcherview.diffByDefault` (default `true`): open patch diffs as one diff canvas instead of two patches side by side.

## Known limits

- Inlet/outlet counts come from a table of vanilla Pd objects. Abstractions and externals only show the iolets that are connected.
- Graph-on-parent subpatches and arrays render as a labelled frame.
- Max interface objects are drawn in their default state; values, presentation mode and most per-object colours aren't.
- Diff matching is heuristic: an object that's both retyped and moved far shows as removed + added.

Also available as a browser extension for GitHub, GitLab and Codeberg (Chrome and Firefox).

[Source and issues](https://github.com/filip-dobrocky/PatcherView) · GPL-3.0-or-later
