// Real filesystem collisions; observer wrappers still call actual Playwright cleanup.
const { chromium } = require("playwright");
const fs = require("node:fs/promises"), sync = require("node:fs"), path = require("node:path");
const out = process.env.BROWSER_ARTIFACTS, scenario = process.env.BRIEF_WRITE_FAULT;
const emit = value => sync.appendFileSync(path.join(out, "cleanup.jsonl"), JSON.stringify(value) + "\n");
const launch = chromium.launch.bind(chromium);
chromium.launch = async (...args) => {
  const browser = await launch(...args), closeBrowser = browser.close.bind(browser);
  let blocked = false, contexts = 0;
  const recover = async () => {
    emit({ event: "probe-cleanup", connected: browser.isConnected() });
    await closeBrowser();
    emit({ event: "probe-closed", connected: browser.isConnected() });
  };
  process.once("SIGTERM", recover);
  browser.close = async (...options) => {
    emit({ event: "browser-close" });
    await closeBrowser(...options);
    emit({ event: "browser-closed", connected: browser.isConnected(), contexts: browser.contexts().length });
  };
  const block = async () => {
    if (blocked) return;
    blocked = true;
    await fs.mkdir(path.join(out, "brief-recovery/result.json.tmp"));
    emit({ event: "filesystem-collision" });
    // Independent safety recovery is a failed test, never successful runner cleanup.
    // Unref means this observation does not keep an otherwise finished child alive.
    setTimeout(recover, 4000).unref();
  };
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async (...options) => {
    const context = await newContext(...options), first = contexts++ === 0;
    const close = context.close.bind(context), newPage = context.newPage.bind(context);
    context.close = async (...a) => {
      emit({ event: "context-close" });
      await close(...a);
      emit({ event: "context-closed", pages: context.pages().length });
      if (first && scenario === "after-context-close") await block();
    };
    context.newPage = async (...a) => {
      const page = await newPage(...a);
      if (first && scenario === "after-page-create") await block();
      return page;
    };
    return context;
  };
  return browser;
};
