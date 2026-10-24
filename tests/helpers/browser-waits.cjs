// Shared startup-test predicates; application deadlines are unchanged.
exports.ready = (page, timeout = 12000) =>
  page.waitForFunction(
    () => document.getElementById("run")?.disabled === false,
    null,
    { timeout },
  );
exports.dataError = (page, timeout = 3000) =>
  page.waitForFunction(
    () => document.querySelector("#status")?.getAttribute("role") === "alert",
    null,
    { timeout },
  );
