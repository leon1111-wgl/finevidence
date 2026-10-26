// Subprocess-only HTTP fault injection. Never loaded by the application.
const { chromium } = require('playwright');
const launch = chromium.launch.bind(chromium);
chromium.launch = async (...args) => {
  const browser = await launch(...args);
  const newContext = browser.newContext.bind(browser);
  let contexts = 0;
  browser.newContext = async (...options) => {
    const context = await newContext(...options);
    if (contexts++ === 7) {
      const resource = process.env.REVIEW_REPORT_FAULT === 'initial-ready'
        ? '**/runtime.json' : '**/api/reviews/revoke';
      await context.route(resource, route => route.fulfill({
        status: 503,
        contentType: 'application/json',
        headers: {'X-Private-Test': 'PRIVATE_REVIEW_REPORT_CANARY'},
        body: JSON.stringify({error: 'PRIVATE_REVIEW_REPORT_CANARY'}),
      }));
    }
    return context;
  };
  return browser;
};
