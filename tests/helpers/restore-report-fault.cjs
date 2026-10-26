// Subprocess-only faults at actual browser/HTTP boundaries; no assertion replacement.
const {chromium} = require('playwright');
const mode = process.env.RESTORE_REPORT_FAULT;
const launch = chromium.launch.bind(chromium);
chromium.launch = async (...args) => {
  if (mode === 'launch') throw Error('PRIVATE_RESTORE_CANARY launch');
  const browser = await launch(...args);
  const create = browser.newContext.bind(browser);
  let contexts = 0;
  browser.newContext = async (...options) => {
    const index = contexts++;
    if (index === 2 && mode === 'context') throw Error('PRIVATE_RESTORE_CANARY context');
    const context = await create(...options);
    if (index === 2) {
      let navigation = 0;
      context.on('page', p => p.on('request', r => { if(r.isNavigationRequest() && r.frame() === p.mainFrame()) navigation++; }));
      const target = {'initial-ready':1,'replay-ready':2,'verification-ready':3,'kill':2}[mode];
      await context.route('**/review-ledger-panel.mjs', route => navigation === target
        ? route.fulfill({status:503, contentType:'text/javascript', body:'PRIVATE_RESTORE_CANARY body',headers:{'X-Private':'PRIVATE_RESTORE_CANARY header'}})
        : route.continue());
    }
    return context;
  };
  return browser;
};
