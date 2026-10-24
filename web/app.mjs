// Compatibility for cached documents from before versioned asset graphs.
// Keep this entry independent: even a missing child must leave legacy HTML
// with a keyboard-accessible recovery path. Modern HTML uses bootstrap.mjs.
const legacy = !document.getElementById('workbench');
let pending = true;
const began = performance.now();
let timer;
let panel;
let message;
let shell;
if (legacy) {
  shell = document.querySelector('.shell');
  shell.inert = true;
  panel = document.createElement('section');
  panel.id = 'startup';
  panel.className = 'startup';
  message = document.createElement('p');
  message.id = 'startup-status';
  message.setAttribute('role', 'status');
  message.textContent = '正在加载工作台程序…';
  const reload = document.createElement('a');
  reload.id = 'startup-reload';
  const url = new URL(location.href);
  url.searchParams.set('_fe_reload', String(Date.now()));
  url.hash = '';
  reload.href = url.href;
  reload.textContent = '重新加载工作台';
  panel.append(message, reload);
  shell.before(panel);
}
function fail(code) {
  if (!legacy || !pending) return;
  pending = false;
  clearTimeout(timer);
  message.setAttribute('role', 'alert');
  message.textContent = `程序未能启动，请检查连接后重新加载。 [${code}]`;
  document.getElementById('runtime').textContent = '工作台尚未启动';
  document.getElementById('status').textContent = '程序未就绪，请使用上方的重新加载入口。';
}
if (legacy) timer = setTimeout(() => fail('STARTUP_TIMEOUT'), 8000);
let module;
try {
  const response = await fetch(new URL('./manifest.json', import.meta.url), {
    cache: 'no-store', signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error('STARTUP_LOAD_FAILED');
  const manifest = await response.json();
  if (typeof manifest.asset_version !== 'string' || !/^[a-f0-9]{64}$/.test(manifest.asset_version)) {
    throw new Error('STARTUP_LOAD_FAILED');
  }
  module = await import(new URL(`./assets/${manifest.asset_version}/workbench.mjs`, import.meta.url));
} catch {
  fail('STARTUP_LOAD_FAILED');
  throw new Error('STARTUP_LOAD_FAILED');
}
export const startWorkbench = module.startWorkbench;
if (legacy && pending) {
  if (performance.now() - began >= 8000) fail('STARTUP_TIMEOUT');
  else {
    try {
      startWorkbench();
      pending = false;
      clearTimeout(timer);
      shell.inert = false;
      panel.hidden = true;
    } catch { fail('STARTUP_LOAD_FAILED'); }
  }
}
