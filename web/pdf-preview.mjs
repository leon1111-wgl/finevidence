import { PDF_LIMITS, PDFJS_VERSION, loadLibrary } from "./pdf-intake.mjs";
const failure = (code) => Object.assign(new Error(code), { code });

// Fixed raster budget independent of screen DPR and untrusted PDF dimensions.
export function previewViewport({ width, height }) {
  if (![width, height].every((n) => Number.isFinite(n) && n > 0))
    throw failure("PDF_PREVIEW_SIZE");
  const scale = Math.min(
    1.5,
    2000 / width,
    2000 / height,
    Math.sqrt(2000000 / width / height),
  );
  if (!Number.isFinite(scale) || scale <= 0) throw failure("PDF_PREVIEW_SIZE");
  return {
    scale,
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
  };
}

// Re-read the selected local File and bind it to the preflight byte digest. A
// detached canvas belongs to this attempt and is attached only after success.
export async function renderPdfPage(file, { sha256, page, canvas, signal }) {
  let task, worker, port, rendering, timer, abortListener, reason;
  const stopped = new Promise((_, reject) => {
    const stop = (code) => {
      reason = code;
      reject(failure(code));
    };
    abortListener = () => stop("PDF_PREVIEW_CANCELLED");
    if (signal?.aborted) abortListener();
    else signal?.addEventListener("abort", abortListener, { once: true });
    timer = setTimeout(() => stop("PDF_PREVIEW_TIMEOUT"), PDF_LIMITS.timeout);
  });
  const active = () => {
    if (reason) throw failure(reason);
  };
  const run = async () => {
    active();
    if (!Number.isInteger(page) || page < 1 || page > PDF_LIMITS.pages)
      throw failure("PDF_PREVIEW_PAGE");
    if (
      !file ||
      !Number.isSafeInteger(file.size) ||
      file.size < 8 ||
      file.size > PDF_LIMITS.bytes
    )
      throw failure("PDF_PREVIEW_SIZE");
    const bytes = new Uint8Array(await file.arrayBuffer());
    active();
    if (bytes.length !== file.size) throw failure("PDF_PREVIEW_CHANGED");
    const digest = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      (b) => b.toString(16).padStart(2, "0"),
    ).join("");
    active();
    if (digest !== sha256) throw failure("PDF_PREVIEW_CHANGED");
    const lib = await loadLibrary();
    active();
    if (lib.version !== PDFJS_VERSION) throw failure("PDF_PREVIEW_FAILED");
    port = new Worker(new URL("./vendor/pdf.worker.min.mjs", import.meta.url), {
      type: "module",
    });
    worker = new lib.PDFWorker({ port });
    task = lib.getDocument({
      data: bytes,
      worker,
      isEvalSupported: false,
      useSystemFonts: true,
      useWorkerFetch: false,
      useWasm: false,
      isOffscreenCanvasSupported: false,
      isImageDecoderSupported: false,
      stopAtErrors: true,
      disableAutoFetch: true,
      disableStream: true,
      disableRange: true,
      enableXfa: false,
      verbosity: 0,
    });
    const pdf = await task.promise;
    active();
    if (pdf.numPages > PDF_LIMITS.pages || page > pdf.numPages)
      throw failure("PDF_PREVIEW_PAGE");
    const source = await pdf.getPage(page);
    active();
    const size = previewViewport(source.getViewport({ scale: 1 }));
    canvas.width = size.width;
    canvas.height = size.height;
    const viewport = source.getViewport({ scale: size.scale });
    rendering = source.render({
      canvasContext: canvas.getContext("2d"),
      viewport,
      background: "rgb(255,255,255)",
      annotationMode: lib.AnnotationMode.DISABLE,
    });
    await rendering.promise;
    active();
    return { page, sha256: digest, width: size.width, height: size.height };
  };
  let success = false;
  try {
    const result = await Promise.race([run(), stopped]);
    success = true;
    return result;
  } catch (e) {
    if (reason) throw failure(reason);
    throw failure(
      e.code?.startsWith("PDF_PREVIEW_") ? e.code : "PDF_PREVIEW_FAILED",
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abortListener);
    rendering?.cancel();
    if (task) void task.destroy().catch(() => {});
    else worker?.destroy();
    port?.terminate();
    if (!success) {
      canvas.width = 0;
      canvas.height = 0;
    }
  }
}
