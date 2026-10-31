import PDFDocument from "pdfkit";
import { createRequire } from "node:module";
import { branchLine, type JobContent } from "../src/shared/hiring";
import { formatStamp } from "../src/shared/format";

const require = createRequire(import.meta.url);
// WOFF fonts from @fontsource (latin subset includes o‘ g‘ ʻ — ’ etc.)
const FONT = {
  regular: require.resolve("@fontsource/inter/files/inter-latin-400-normal.woff"),
  semibold: require.resolve("@fontsource/inter/files/inter-latin-600-normal.woff"),
  poster: require.resolve("@fontsource/antonio/files/antonio-latin-700-normal.woff"),
};

const C = { ember: "#71292A", foam: "#F3E6DA", rose: "#F5C9BD", bean: "#251B14", muted: "#6B5F57", line: "#E5DDD4", cream: "#FBF7F3" };
const M = 48; // page margin
const FOOTER = 40;

/** Branded A4 PDF of the job post ("Ish shartlari"). */
export function jobContentPdf(c: JobContent): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: M, bufferPages: true, info: { Title: `${c.title} — Coffee House`, Author: "Coffee House" } });
  doc.registerFont("regular", FONT.regular);
  doc.registerFont("semibold", FONT.semibold);
  doc.registerFont("poster", FONT.poster);

  const W = doc.page.width;
  const inner = W - M * 2;
  const bottom = () => doc.page.height - M - FOOTER;
  const ensure = (h: number) => {
    if (doc.y + h > bottom()) {
      doc.addPage();
      doc.y = M;
    }
  };

  /* Header band */
  doc.font("poster").fontSize(30);
  const titleH = doc.heightOfString(c.title.toUpperCase(), { width: inner, lineGap: -4 });
  doc.font("regular").fontSize(11);
  const introH = c.intro ? doc.heightOfString(c.intro, { width: inner, lineGap: 2 }) + 10 : 0;
  const bandH = M + 18 + titleH + introH + 24;
  doc.rect(0, 0, W, bandH).fill(C.ember);
  doc.fillColor(C.rose).font("semibold").fontSize(9).text("COFFEE HOUSE · ISHGA QABUL", M, M, { characterSpacing: 1.2 });
  doc.fillColor(C.foam).font("poster").fontSize(30).text(c.title.toUpperCase(), M, M + 18, { width: inner, lineGap: -4 });
  if (c.intro) doc.font("regular").fontSize(11).fillColor(C.foam).opacity(0.85).text(c.intro, M, doc.y + 10, { width: inner, lineGap: 2 }).opacity(1);
  doc.y = bandH + 20;

  /* Facts */
  if (c.facts.length) {
    const cols = c.facts.length <= 4 ? c.facts.length : 3;
    const gap = 10;
    const cw = (inner - gap * (cols - 1)) / cols;
    const ch = 50;
    for (let r = 0; r < c.facts.length; r += cols) {
      ensure(ch + gap);
      const top = doc.y;
      c.facts.slice(r, r + cols).forEach((f, j) => {
        const x = M + j * (cw + gap);
        doc.roundedRect(x, top, cw, ch, 8).lineWidth(0.8).fillAndStroke("#FFFFFF", C.line);
        doc.fillColor(C.muted).font("semibold").fontSize(7.5).text(f.label.toUpperCase(), x + 12, top + 11, { width: cw - 24, characterSpacing: 0.8, lineBreak: false, ellipsis: true });
        // shrink long values to fit one line in the card
        let size = 16;
        doc.font("poster");
        while (size > 9 && doc.fontSize(size).widthOfString(f.value) > cw - 24) size -= 0.5;
        doc.fillColor(C.bean).fontSize(size).text(f.value, x + 12, top + 25 + (16 - size) / 2, { width: cw - 24, lineBreak: false, ellipsis: true });
      });
      doc.y = top + ch + gap;
    }
    doc.y += 16;
  }

  const heading = (t: string) => {
    ensure(60);
    doc.fillColor(C.bean).font("poster").fontSize(18).text(t.toUpperCase(), M, doc.y, { width: inner });
    doc.moveTo(M, doc.y + 4).lineTo(M + 36, doc.y + 4).lineWidth(2).strokeColor(C.ember).stroke();
    doc.y += 12;
  };

  /* Offer */
  if (c.offer.length) {
    heading("Biz taklif qilamiz");
    for (const o of c.offer) {
      doc.font("semibold").fontSize(11);
      const h1 = doc.heightOfString(o.title, { width: inner - 16 });
      doc.font("regular").fontSize(10);
      const h2 = o.text ? doc.heightOfString(o.text, { width: inner - 16, lineGap: 1.5 }) + 3 : 0;
      ensure(h1 + h2 + 12);
      const top = doc.y;
      doc.rect(M, top + 2, 3, h1 + h2 - 2).fill(C.ember);
      doc.fillColor(C.bean).font("semibold").fontSize(11).text(o.title, M + 14, top, { width: inner - 16 });
      if (o.text) doc.fillColor(C.muted).font("regular").fontSize(10).text(o.text, M + 14, doc.y + 3, { width: inner - 16, lineGap: 1.5 });
      doc.y += 9;
    }
    doc.y += 10;
  }

  /* Expectations */
  if (c.expect.length) {
    heading("Sizdan kutamiz");
    for (const e of c.expect) {
      doc.font("regular").fontSize(10.5);
      const h = doc.heightOfString(e, { width: inner - 22, lineGap: 1.5 });
      ensure(h + 9);
      const top = doc.y;
      // vector check mark (no font glyph needed)
      doc.moveTo(M + 1, top + 6.5).lineTo(M + 4.5, top + 10).lineTo(M + 11, top + 3).lineWidth(1.6).strokeColor(C.ember).stroke();
      doc.fillColor(C.bean).text(e, M + 22, top, { width: inner - 22, lineGap: 1.5 });
      doc.y += 6;
    }
  }

  /* Footer on every page */
  const footer = `${branchLine(c)}  ·  ${formatStamp(new Date().toISOString())}`;
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const y = doc.page.height - M - 14;
    doc.moveTo(M, y - 8).lineTo(W - M, y - 8).lineWidth(0.6).strokeColor(C.line).stroke();
    doc.fillColor(C.muted).font("regular").fontSize(8).text(footer, M, y, { width: inner - 40, lineBreak: false, ellipsis: true });
    doc.text(`${i + 1}/${range.count}`, W - M - 40, y, { width: 40, align: "right", lineBreak: false });
  }

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (b: Buffer) => chunks.push(b));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}
