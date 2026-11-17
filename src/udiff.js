// Changed files of a unified diff: [{oldPath, newPath}], null for /dev/null (added/deleted).
export function diffFiles(text) {
  const files = [];
  let f = null, left = 0;
  const path = (p) => (p === '/dev/null' ? null : p.replace(/^[ab]\//, '').replace(/\t.*$/, ''));
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (left > 0) {
      // hunk body: count lines so a removed "--- x" line isn't read as a header
      if (line[0] !== '\\') left -= line[0] === '+' || line[0] === '-' ? 1 : 2;
      continue;
    }
    const hunk = /^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@/.exec(line);
    if (line.startsWith('diff ')) {
      const m = /^diff --git a\/(.*) b\/(.*)$/.exec(line);
      files.push((f = { oldPath: m?.[1] ?? null, newPath: m?.[2] ?? null }));
    } else if (!f) continue;
    else if (line.startsWith('--- ')) f.oldPath = path(line.slice(4));
    else if (line.startsWith('+++ ')) f.newPath = path(line.slice(4));
    else if (line.startsWith('new file mode')) f.oldPath = null;
    else if (line.startsWith('deleted file mode')) f.newPath = null;
    else if (hunk) left = (hunk[1] ?? 1) * 1 + (hunk[2] ?? 1) * 1;
  }
  return files;
}
