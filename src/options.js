const ID = 'custom-sites';
const [cs] = chrome.runtime.getManifest().content_scripts;
const sites = document.querySelector('#sites');
const out = document.querySelector('output');
let saved = [];

chrome.scripting.getRegisteredContentScripts({ ids: [ID] }).then(([s]) => {
  saved = s?.matches ?? [];
  sites.value = saved.map((m) => m.slice(0, -2)).join('\n');
});

document.querySelector('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const origins = [...new Set(sites.value.split(/\s+/).filter(Boolean)
      .map((s) => new URL(s.includes('://') ? s : 'https://' + s).origin + '/*'))];
    // permissions.request needs the user gesture: keep it the first await.
    if (origins.length && !(await chrome.permissions.request({ origins }))) throw new Error('permission not granted');
    await chrome.scripting.unregisterContentScripts({ ids: [ID] }).catch(() => {});
    if (origins.length) await chrome.scripting.registerContentScripts([{ id: ID, matches: origins, js: cs.js, css: cs.css }]);
    const dropped = saved.filter((o) => !origins.includes(o));
    if (dropped.length) await chrome.permissions.remove({ origins: dropped });
    saved = origins;
    out.textContent = 'Saved. Reload open tabs.';
  } catch (err) {
    out.textContent = err.message;
  }
});
