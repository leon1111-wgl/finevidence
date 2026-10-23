import { identifySource } from "./source-catalog.mjs";
// Untrusted local PDF -> unverified page inventory. Never imports financial facts.
export const PDF_LIMITS = Object.freeze({
  bytes: 5 * 1024 * 1024,
  pages: 120,
  pageText: 100000,
  totalText: 500000,
  timeout: 12000,
});
export const PDFJS_VERSION = "6.4.299";
const failure = (code) => Object.assign(new Error(code), { code });
let library = null,
  loadGeneration = 0;
function loadLibrary() {
  if (library) return Promise.resolve(library);
  const url = new URL("./vendor/pdf.min.mjs", import.meta.url);
  // Pending and failed imports are cached by URL by the browser. Each explicit
  // uncached attempt owns a fresh URL; abandoned imports cannot block a retry.
  // Native import cannot be aborted. Only an active caller may cache success.
  if (loadGeneration) url.searchParams.set("retry", String(loadGeneration));
  loadGeneration++;
  return import(url.href);
}

export async function inspectPdf(
  file,
  { signal, onProgress = () => {}, sourceKind = "user" } = {},
) {
  let port, worker, task, timer, abortListener, reason;
  let loadingReader = false;
  const stopped = new Promise((_, reject) => {
    const stop = (code) => {
      reason = code;
      reject(failure(code));
    };
    abortListener = () => stop("PDF_CANCELLED");
    if (signal?.aborted) abortListener();
    else signal?.addEventListener("abort", abortListener, { once: true });
    timer = setTimeout(
      () => stop(loadingReader ? "PDF_READER_TIMEOUT" : "PDF_TIMEOUT"),
      PDF_LIMITS.timeout,
    );
  });
  const active = () => {
    if (reason) throw failure(reason);
  };
  const run = async () => {
    active();
    if (!Number.isSafeInteger(file.size) || file.size > PDF_LIMITS.bytes)
      throw failure("PDF_BYTE_LIMIT");
    if (file.size < 8) throw failure("PDF_SIGNATURE");
    onProgress("正在读取文件并计算指纹…");
    let raw;
    try {
      raw = await file.arrayBuffer();
    } catch {
      throw failure("PDF_READ_FAILED");
    }
    active();
    const bytes = new Uint8Array(raw);
    if (bytes.length !== file.size || bytes.length > PDF_LIMITS.bytes)
      throw failure("PDF_BYTE_LIMIT");
    if (
      !new TextDecoder("ascii").decode(bytes.slice(0, 8)).match(/^%PDF-\d\.\d/)
    )
      throw failure("PDF_SIGNATURE");
    const digest = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      (b) => b.toString(16).padStart(2, "0"),
    ).join("");
    active();
    let lib;
    try {
      loadingReader = true;
      onProgress("正在加载 PDF 读取组件…");
      lib = await loadLibrary();
      active();
      if (lib.version !== PDFJS_VERSION)
        throw failure("PDF_READER_UNAVAILABLE");
      library = lib;
      loadingReader = false;
      port = new Worker(
        new URL("./vendor/pdf.worker.min.mjs", import.meta.url),
        { type: "module" },
      );
      worker = new lib.PDFWorker({ port });
    } catch (e) {
      if (reason) throw failure(reason);
      throw failure("PDF_READER_UNAVAILABLE");
    }
    onProgress("正在检查 PDF 页数与文本…");
    task = lib.getDocument({
      data: bytes,
      worker,
      isEvalSupported: false,
      disableFontFace: true,
      useSystemFonts: false,
      useWorkerFetch: false,
      isOffscreenCanvasSupported: false,
      isImageDecoderSupported: false,
      stopAtErrors: true,
      disableAutoFetch: true,
      disableStream: true,
      disableRange: true,
      verbosity: 0,
    });
    let pdf;
    try {
      pdf = await task.promise;
    } catch (e) {
      throw failure(
        e.name === "PasswordException" ? "PDF_ENCRYPTED" : "PDF_INVALID",
      );
    }
    active();
    if (pdf.numPages > PDF_LIMITS.pages) throw failure("PDF_PAGE_LIMIT");
    const pages = [];
    let total = 0;
    for (let i = 1; i <= pdf.numPages; i++) {
      active();
      onProgress(`正在提取第 ${i} / ${pdf.numPages} 个物理页…`);
      let page, content;
      try {
        page = await pdf.getPage(i);
        content = await page.getTextContent();
      } catch {
        throw failure("PDF_EXTRACTION_FAILED");
      }
      active();
      let text = "";
      for (const item of content.items) {
        if (typeof item.str !== "string") continue;
        text += item.str + (item.hasEOL ? "\n" : " ");
        if (text.length > PDF_LIMITS.pageText) throw failure("PDF_TEXT_LIMIT");
      }
      text = text.trim();
      total += text.length;
      if (total > PDF_LIMITS.totalText) throw failure("PDF_TEXT_LIMIT");
      pages.push({
        page: i,
        page_kind: "pdf_physical",
        status: text ? "TEXT_EXTRACTED" : "NO_EXTRACTABLE_TEXT",
        character_count: text.length,
        text,
      });
      page.cleanup();
    }
    active();
    const textPages = pages.filter((p) => p.text).length;
    return {
      schema_version: 1,
      classification:
        sourceKind === "demo"
          ? "SYNTHETIC_DEMO_UNVERIFIED"
          : "USER_SUPPLIED_UNVERIFIED",
      verification_status: "unverified",
      financial_calculation_eligible: false,
      status:
        textPages === pages.length ? "NEEDS_REVIEW" : "NEEDS_OCR_OR_REVIEW",
      file: { name: file.name, bytes: file.size, sha256: digest },
      source_reference: identifySource({ bytes: file.size, sha256: digest }),
      parser: { name: "PDF.js", version: PDFJS_VERSION },
      page_count: pages.length,
      text_pages: textPages,
      character_count: total,
      pages,
      limitations: [
        "Text extraction is not visual or semantic verification.",
        "No licensing or authenticity approval.",
        "No OCR; a textless page may be blank, scanned or unsupported.",
        "This inventory is not accepted as financial facts or a replay package.",
      ],
    };
  };
  try {
    return await Promise.race([run(), stopped]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abortListener);
    // Do not wait for a hung worker acknowledgement to cancel the UI operation.
    if (task) void task.destroy().catch(() => {});
    else if (worker) worker.destroy();
    port?.terminate();
  }
}
