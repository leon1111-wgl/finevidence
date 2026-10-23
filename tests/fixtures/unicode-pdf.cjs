// Authored SYNTHETIC extraction fixture, not a visual/table-quality oracle.
// Helvetica glyphs are deliberately mapped through ToUnicode so that the
// actual PDF parser, not a constructed report object, supplies boundary text.
module.exports = function unicodePdf(token) {
  const text = `SYNTHETIC amount ${token} units; control 300 units`;
  const extra = [...new Set([...text].filter((c) => c.charCodeAt(0) > 127))];
  const raw = Buffer.from(
    [...text].map((c) =>
      extra.includes(c) ? 128 + extra.indexOf(c) : c.charCodeAt(0),
    ),
  );
  const stream = `BT /F1 12 Tf 30 740 Td <${raw.toString("hex")}> Tj ET\n`;
  const cmap =
    `/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /SyntheticUnicode def\n/CMapType 2 def\n1 begincodespacerange\n<00> <FF>\nendcodespacerange\n${128 + extra.length} beginbfchar\n` +
    Array.from(
      { length: 128 + extra.length },
      (_, i) =>
        `<${i.toString(16).padStart(2, "0")}> <${(i < 128 ? i : extra[i - 128].charCodeAt(0)).toString(16).padStart(4, "0")}>\n`,
    ).join("") +
    "endbfchar\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend\n";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding << /Type /Encoding /BaseEncoding /WinAnsiEncoding /Differences [${extra.map((c, i) => `${128 + i} /${c === "－" ? "hyphen" : "percent"}`).join(" ")}] >> /ToUnicode 6 0 R >>`,
    `<< /Length ${stream.length} >>\nstream\n${stream}endstream`,
    `<< /Length ${cmap.length} >>\nstream\n${cmap}endstream`,
  ];
  let data = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((o, i) => {
    offsets.push(data.length);
    data += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = data.length;
  data +=
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
    offsets
      .slice(1)
      .map((o) => `${String(o).padStart(10, "0")} 00000 n \n`)
      .join("") +
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return { text, bytes: Buffer.from(data, "ascii") };
};
