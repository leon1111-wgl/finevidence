import { renderPdfPage } from "./pdf-preview.mjs";
import { displayFileName } from "./file-name.mjs";
const $ = (id) => document.getElementById(id);
const messages = {
  PDF_PREVIEW_CHANGED: "文件字节与预检指纹不一致，请重新选择资料。",
  PDF_PREVIEW_SIZE: "页面尺寸或文件容量不受支持，请用本机 PDF 阅读器核对。",
  PDF_PREVIEW_PAGE: "找不到对应的物理页，请重新选择资料。",
  PDF_PREVIEW_CANCELLED: "已取消原页预览，可重新查看。",
  PDF_PREVIEW_TIMEOUT:
    "预览超过 12 秒，已停止等待。可重试或用本机 PDF 阅读器核对。",
  PDF_PREVIEW_FAILED: "原页预览失败。可重试或用本机 PDF 阅读器核对。",
};
export function bindPdfPreview(getSource) {
  let sequence = 0,
    controller = null;
  const status = (text, error = false) => {
    const n = $("pdf-preview-status");
    n.textContent = text;
    n.className = error ? "error" : "small";
    n.setAttribute("role", error ? "alert" : "status");
  };
  const busy = (value) => {
    $("pdf-preview").setAttribute("aria-busy", String(value));
    $("pdf-preview-show").disabled = value;
    $("pdf-preview-cancel").hidden = !value;
  };
  const clearCanvas = () => {
    for (const canvas of $("pdf-preview-image").querySelectorAll("canvas")) {
      canvas.width = 0;
      canvas.height = 0;
    }
    $("pdf-preview-image").replaceChildren();
    $("pdf-preview-image").classList.remove("actual-size");
    $("pdf-preview-zoom").value = "fit";
    $("pdf-preview-tools").hidden = true;
  };
  const reset = () => {
    sequence++;
    controller?.abort();
    controller = null;
    clearCanvas();
    busy(false);
    status(
      "选择“查看本页版面”，对照列标题、单位和金额；预览不会标记审核通过。",
    );
  };
  $("pdf-preview-show").onclick = async () => {
    const { file, report } = getSource();
    if (!file || !report) return;
    const page = Number($("pdf-page").value),
      id = ++sequence;
    controller?.abort();
    controller = new AbortController();
    const owned = controller,
      canvas = document.createElement("canvas");
    clearCanvas();
    busy(true);
    status(`正在绘制物理页 ${page}…`);
    try {
      const result = await renderPdfPage(file, {
        page,
        sha256: report.file.sha256,
        canvas,
        signal: owned.signal,
      });
      if (sequence !== id) {
        canvas.width = 0;
        canvas.height = 0;
        return;
      }
      canvas.setAttribute("role", "img");
      canvas.setAttribute(
        "aria-label",
        `${displayFileName(report.file.name)}，物理页 ${page} 原始版面预览；文字内容见本页提取文字。`,
      );
      $("pdf-preview-image").append(canvas);
      $("pdf-preview-tools").hidden = false;
      status(
        `物理页 ${result.page} · ${displayFileName(report.file.name)} · 指纹 ${result.sha256.slice(0, 12)} · 仅供对照，仍待人工核验。`,
      );
    } catch (e) {
      if (sequence === id)
        status(
          `${messages[e.code] || messages.PDF_PREVIEW_FAILED} [${e.code in messages ? e.code : "PDF_PREVIEW_FAILED"}]`,
          true,
        );
    } finally {
      if (sequence === id) {
        controller = null;
        busy(false);
      }
    }
  };
  $("pdf-preview-zoom").onchange = () =>
    $("pdf-preview-image").classList.toggle(
      "actual-size",
      $("pdf-preview-zoom").value === "actual",
    );
  $("pdf-preview-hide").onclick = () => {
    reset();
    $("pdf-preview-show").focus();
  };
  $("pdf-preview-cancel").onclick = () => controller?.abort();
  reset();
  return { reset };
}
