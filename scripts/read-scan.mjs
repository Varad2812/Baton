// Short-lived process so the web service can bound PDF rendering and OCR time.
import { getDocumentProxy } from "unpdf";
import { createWorker } from "tesseract.js";
import english from "@tesseract.js-data/eng";
import { createCanvas, DOMMatrix, ImageData, Path2D } from "@napi-rs/canvas";

Object.assign(globalThis, { DOMMatrix, ImageData, Path2D });
// Keep PDF.js diagnostics out of the JSON output stream.
console.log = console.error;
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const bytes = Buffer.concat(chunks);
class CanvasFactory {
  create(width, height) {
    const canvas = createCanvas(width, height);
    return {canvas, context: canvas.getContext("2d")};
  }
  reset(target, width, height) {
    target.canvas.width = width;
    target.canvas.height = height;
  }
  destroy(target) {
    this.reset(target, 0, 0);
    target.canvas = target.context = null;
  }
}
const pdf = await getDocumentProxy(new Uint8Array(bytes), { CanvasFactory, maxImageSize: 16000000 });
const worker = await createWorker("eng", 1, { langPath: english.langPath, cacheMethod: "none" });
try {
  const results = [];
  for (const number of process.argv.slice(2).map(Number)) {
    const page = await pdf.getPage(number);
    const {width, height} = page.getViewport({scale: 1});
    const viewport = page.getViewport({scale: Math.min(2.5, 1800 / Math.max(width, height))});
    const canvas = createCanvas(Math.max(1, Math.ceil(viewport.width)), Math.max(1, Math.ceil(viewport.height)));
    await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
    const {data} = await worker.recognize(canvas.toBuffer("image/png"));
    results.push(data.text.trim());
    page.cleanup();
  }
  process.stdout.write(JSON.stringify(results));
} finally {
  await worker.terminate();
  await pdf.destroy();
}
