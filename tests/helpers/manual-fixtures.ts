/* Real PDF and DOCX files, built in the test rather than committed as
   binaries, so what each fixture contains is readable here. */
import JSZip from "jszip";

/** A minimal, valid PDF with one text line set per page. */
export function makePdf(pages: string[][]): Buffer {
  const objs: string[] = [];
  const n = pages.length;
  // 1 catalog, 2 pages, 3 font, then (page, content) per page
  objs[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  const kids = pages.map((_, i) => `${4 + i * 2} 0 R`).join(" ");
  objs[2] = `<< /Type /Pages /Kids [${kids}] /Count ${n} >>`;
  objs[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  pages.forEach((lines, i) => {
    const esc = (t: string) => t.replace(/[\\()]/g, (c) => "\\" + c);
    const body =
      "BT /F1 11 Tf 14 TL 50 780 Td " +
      lines.map((l) => `(${esc(l)}) Tj T*`).join(" ") +
      " ET";
    objs[4 + i * 2] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] ` +
      `/Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`;
    objs[5 + i * 2] = `<< /Length ${Buffer.byteLength(body)} >>\nstream\n${body}\nendstream`;
  });
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let k = 1; k < objs.length; k++) {
    offsets[k] = Buffer.byteLength(out);
    out += `${k} 0 obj\n${objs[k]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
  for (let k = 1; k < objs.length; k++) out += `${String(offsets[k]).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

/** A minimal, valid .docx whose paragraphs are the given lines. */
export async function makeDocx(lines: string[]): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
  );
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${lines
      .map((l) => `<w:p><w:r><w:t xml:space="preserve">${esc(l)}</w:t></w:r></w:p>`)
      .join("")}</w:body></w:document>`,
  );
  return zip.generateAsync({ type: "nodebuffer" });
}
