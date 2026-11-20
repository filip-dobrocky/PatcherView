const vscode = require('vscode');

const kind = (uri) => (/\.pd$/i.test(uri.path) ? 'pd' : 'max');
const STATE = ['style-pd', 'style-max'];

function setup(context, webview, uri, onReady, onText = () => vscode.commands.executeCommand('vscode.openWith', uri, 'default')) {
  const dist = vscode.Uri.joinPath(context.extensionUri, 'dist');
  webview.options = { enableScripts: true, localResourceRoots: [dist] };
  const src = (f) => webview.asWebviewUri(vscode.Uri.joinPath(dist, f));
  webview.html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline';">
<link rel="stylesheet" href="${src('webview.css')}">
<style>
body { padding: 0; }
.patcherview { --borderColor-default: var(--vscode-panel-border); border: 0; border-radius: 0; margin: 0; }
.patcherview-bar { position: sticky; top: 0; z-index: 1; background: var(--vscode-editor-background); color: var(--vscode-foreground); }
.patcherview-view { max-height: none; min-height: calc(100vh - 50px); }
</style></head><body><script src="${src('webview.js')}"></script></body></html>`;
  const post = (msg) => {
    const state = Object.fromEntries(STATE.map((k) => [k, context.globalState.get(k)]));
    webview.postMessage({ kind: kind(uri), state, ...msg });
  };
  return webview.onDidReceiveMessage((m) => {
    if (m.ready) onReady(post);
    if (m.set) context.globalState.update(m.set, m.value);
    if (m.text) onText();
  });
}

const read = (uri) => vscode.workspace.openTextDocument(uri).then((d) => d.getText(), () => '');

async function headUri(uri) {
  const git = vscode.extensions.getExtension('vscode.git');
  if (!git) throw new Error('the Git extension is not available');
  return (await git.activate()).getAPI(1).toGitUri(uri, 'HEAD');
}

async function diff(context) {
  const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
  try {
    let a, b;
    if (input instanceof vscode.TabInputTextDiff) [a, b] = [input.original, input.modified];
    else if (input?.uri) [a, b] = [await headUri(input.uri), input.uri];
    else return;
    await showDiff(context, a, b);
  } catch (e) {
    vscode.window.showErrorMessage(`PatcherView: ${e.message}`);
  }
}

const PATCH = /\.(pd|maxpat|maxhelp|gendsp)$/i;
const keepText = new Set(); // diffs switched to text with the Text button stay text
const diffKey = (a, b) => a.toString() + '|' + b.toString();
const swapping = new Set();

async function showDiff(context, a, b) {
  const [old, neu] = await Promise.all([read(a), read(b)]);
  const panel = vscode.window.createWebviewPanel('patcherview.diff', `${b.path.split('/').pop()} (patch diff)`, vscode.ViewColumn.Active);
  const toText = () => { keepText.add(diffKey(a, b)); vscode.commands.executeCommand('vscode.diff', a, b, `${b.path.split('/').pop()} (text diff)`); };
  panel.onDidDispose(setup(context, panel.webview, b, (post) => post({ old, new: neu }), toText).dispose);
}

// Source Control, Timeline etc. open patch changes as text diffs; swap those for the patch diff.
function swapDiffs(context, { opened, changed }) {
  for (const tab of [...opened, ...changed]) {
    const { input } = tab;
    if (!(input instanceof vscode.TabInputTextDiff) || !PATCH.test(input.modified.path)) continue;
    const key = diffKey(input.original, input.modified);
    if (swapping.has(key) || keepText.has(key) || !vscode.workspace.getConfiguration('patcherview').get('diffByDefault')) continue;
    swapping.add(key);
    vscode.window.tabGroups.close(tab).then(() => showDiff(context, input.original, input.modified))
      .catch((e) => vscode.window.showErrorMessage(`PatcherView: ${e.message}`))
      .finally(() => swapping.delete(key));
  }
}

exports.activate = (context) => {
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider('patcherview.patch', {
      resolveCustomTextEditor(document, panel) {
        let post;
        const subs = [
          setup(context, panel.webview, document.uri, (p) => (post = p)({ text: document.getText() })),
          vscode.workspace.onDidChangeTextDocument((e) => e.document === document && post?.({ text: document.getText() })),
        ];
        panel.onDidDispose(() => subs.forEach((s) => s.dispose()));
      },
    }, { webviewOptions: { retainContextWhenHidden: true } }),
    vscode.commands.registerCommand('patcherview.diff', () => diff(context)),
    vscode.window.tabGroups.onDidChangeTabs((e) => swapDiffs(context, e)),
  );
};
