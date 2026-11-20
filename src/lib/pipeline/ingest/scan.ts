import { execFile } from "node:child_process";
import path from "node:path";
import { BadRequestError } from "@/lib/http";

let reading = false;

export async function readScan(bytes: Uint8Array, pageNumbers: number[]): Promise<string[]> {
  if (pageNumbers.length > 4) throw new BadRequestError("This PDF needs OCR on more than four pages. Split the scan into files with up to four scanned pages each.");
  if (reading) throw new BadRequestError("Baton is reading another scan. Retry this file in a moment.");
  reading = true;
  try {
    return await new Promise<string[]>((resolve, reject) => {
      const args = [path.join(process.cwd(), "scripts/read-scan.mjs"), ...pageNumbers.map(String)];
      const child = execFile(process.execPath, args, { timeout: 45_000, killSignal: "SIGKILL", maxBuffer: 1024 * 1024 }, (error, stdout) => {
        try {
          if (error) throw error;
          resolve(JSON.parse(stdout));
        } catch {
          reject(new BadRequestError("Baton could not read this scan. Upload a clearer English scan, a text PDF, or the original document."));
        }
      });
      child.stdin?.on("error", () => { /* The exit callback reports a failed or timed-out reader. */ });
      child.stdin?.end(bytes);
    });
  } finally {
    reading = false;
  }
}
