// Keep this entry independent of the business module graph. HTML provides the
// recovery link even when this file cannot load or JavaScript is unavailable.
const workbench = document.getElementById('workbench');
const panel = document.getElementById('startup');
const message = document.getElementById('startup-status');
const startedAt = performance.now();
const limitMs = 8000;
let pending = true;
function fail(code) {
  if (!pending) return;
  pending = false;
  clearTimeout(timer);
  workbench.inert = true;
  message.setAttribute('role', 'alert');
  message.className = 'error';
  message.textContent = code === 'STARTUP_TIMEOUT'
    ? '程序加载已等待 8 秒，工作台尚未启动。请检查连接后重新加载。 [STARTUP_TIMEOUT]'
    : '程序未能加载，工作台尚未启动。请检查连接后重新加载。 [STARTUP_LOAD_FAILED]';
  document.getElementById('runtime').textContent = '工作台尚未启动';
  document.getElementById('status').textContent = '程序未就绪，请使用上方的重新加载入口。';
}
const timer = setTimeout(() => fail('STARTUP_TIMEOUT'), limitMs);
import('./app.mjs').then(({ startWorkbench }) => {
  // The native import cannot be canceled. Reject late success even if browser
  // timer throttling lets the promise callback run before the timeout callback.
  if (!pending) return;
  if (performance.now() - startedAt >= limitMs) return fail('STARTUP_TIMEOUT');
  startWorkbench();
  pending = false;
  clearTimeout(timer);
  workbench.inert = false;
  panel.hidden = true;
}).catch(() => fail('STARTUP_LOAD_FAILED'));
