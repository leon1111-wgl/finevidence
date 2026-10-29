// Child-process-only faults. No application hooks or shortened product deadlines.
const { chromium } = require("playwright");
const scenario = process.env.BRIEF_REPORT_FAULT;
const privateError = () => Error("PRIVATE_BRIEF_CANARY /Users/private/report.txt");
const launch = chromium.launch.bind(chromium);
chromium.launch = async (...args) => {
  if (scenario === "launch") throw privateError();
  if (scenario === "kill") {
    // No browser has been started: an external kill can safely test checkpoints.
    setInterval(() => {}, 1000);
    await new Promise(() => {});
  }
  const browser = await launch(...args);
  if (scenario === "browser-close") {
    const close = browser.close.bind(browser);
    browser.close = async () => { await close(); throw privateError(); };
  }
  const newContext = browser.newContext.bind(browser);
  let contexts = 0;
  browser.newContext = async (...options) => {
    const target = contexts++ === 2; // Preserve the two preceding desktop controls.
    if (target && scenario === "context") throw privateError();
    const context = await newContext(...options);
    if (!target) return context;
    if (["ready", "ready-close"].includes(scenario)) {
      await context.route("**/runtime.json", route => route.fulfill({
        status: 503, contentType: "application/json",
        body: JSON.stringify({ error: "PRIVATE_BRIEF_CANARY" }),
      }));
    }
    if (scenario === "download") {
      await context.addInitScript(() => {
        const click = HTMLAnchorElement.prototype.click;
        HTMLAnchorElement.prototype.click = function () {
          // Keep allocation-failure/retry logic intact; suppress the actual download.
          if (this.download.endsWith(".html")) return;
          return click.call(this);
        };
      });
    }
    if (["context-close", "ready-close"].includes(scenario)) {
      const close = context.close.bind(context);
      context.close = async () => { await close(); throw privateError(); };
    }
    return context;
  };
  return browser;
};
