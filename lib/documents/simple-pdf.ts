type PdfLine = { text: string; x: number; y: number; size?: number; bold?: boolean; color?: string };
type PdfRect = { x: number; y: number; width: number; height: number; color: string };
type PdfJpeg = { data: Uint8Array; pixelWidth: number; pixelHeight: number; x: number; y: number; width: number; height: number };

function latin1(value: string): string {
  return value.normalize("NFKD").replace(/[^\x20-\x7E]/g, (char) => {
    const code = char.charCodeAt(0);
    return code <= 255 ? char : "?";
  });
}

function pdfText(value: string): string {
  return latin1(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function rgb(hex: string): string {
  const value = hex.replace("#", "");
  return [0, 2, 4].map((i) => (parseInt(value.slice(i, i + 2), 16) / 255).toFixed(3)).join(" ");
}

export function createSinglePagePdf(opts: {
  title: string;
  lines: PdfLine[];
  rects?: PdfRect[];
  jpeg?: PdfJpeg;
}): Uint8Array {
  const commands: string[] = [];
  for (const rect of opts.rects ?? []) {
    commands.push(`${rgb(rect.color)} rg ${rect.x} ${rect.y} ${rect.width} ${rect.height} re f`);
  }
  for (const line of opts.lines) {
    commands.push(
      `BT /${line.bold ? "F2" : "F1"} ${line.size ?? 10} Tf ${rgb(line.color ?? "#1F2730")} rg ` +
      `1 0 0 1 ${line.x} ${line.y} Tm (${pdfText(line.text)}) Tj ET`
    );
  }
  if (opts.jpeg) {
    commands.push(`q ${opts.jpeg.width} 0 0 ${opts.jpeg.height} ${opts.jpeg.x} ${opts.jpeg.y} cm /Im1 Do Q`);
  }
  const stream = commands.join("\n");
  const imageResource = opts.jpeg ? " /XObject << /Im1 8 0 R >>" : "";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R /F2 6 0 R >>${imageResource} >> /Contents 4 0 R >>`,
    `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    `<< /Title (${pdfText(opts.title)}) /Producer (T4XI) >>`,
  ];
  if (opts.jpeg) {
    const bytes = Buffer.from(opts.jpeg.data).toString("latin1");
    objects.push(
      `<< /Type /XObject /Subtype /Image /Width ${opts.jpeg.pixelWidth} /Height ${opts.jpeg.pixelHeight} ` +
      `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${opts.jpeg.data.byteLength} >>\nstream\n${bytes}\nendstream`
    );
  }
  let body = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body, "latin1"));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(body, "latin1");
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 7 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}
