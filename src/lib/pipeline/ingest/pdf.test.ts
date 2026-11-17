import { describe, expect, it } from "vitest";
import { fileToRawSources } from "./files";

/** Minimal valid PDF: one page per entry, each with the given text (or no text layer when empty). */
function pdf(pages: string[]): Uint8Array {
  const objs: string[] = [];
  const kids = pages.map((_, i) => `${3 + i * 2} 0 R`).join(" ");
  objs.push("<< /Type /Catalog /Pages 2 0 R >>");
  objs.push(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);
  const font = 3 + pages.length * 2;
  pages.forEach((text, i) => {
    const stream = text ? `BT /F1 12 Tf 72 720 Td (${text}) Tj ET` : "";
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${4 + i * 2} 0 R /Resources << /Font << /F1 ${font} 0 R >> >> >>`);
    objs.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });
  objs.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}

const opts = { access: "TEAM" as const, key: () => "src_pdf" };

describe("PDF upload", () => {
  it("extracts text per page with page locators", async () => {
    const [src] = await fileToRawSources({ name: "handover-notes.pdf", bytes: pdf(["Decided to keep Render for hosting.", "Meera owns the deploy key."]) }, opts);
    expect(src.kind).toBe("DOC");
    expect(src.items.map((i) => i.locator)).toEqual(["p.1", "p.2"]);
    expect(src.items[0].text).toContain("Decided to keep Render for hosting.");
  });
  it("explains a scanned PDF with no text layer", async () => {
    await expect(fileToRawSources({ name: "scan.pdf", bytes: pdf(["", ""]) }, opts)).rejects.toThrow(/scanned PDF/);
  });
});
