import { describe, expect, it, vi } from "vitest";
import { fetchGoogleDoc, googleDocId } from "./drive";
const link = "https://docs.google.com/document/d/abcdefghijk1234/edit";
describe("Google Docs import", () => {
  it("reads a public text export without a token",async()=>{
    const call=vi.fn().mockResolvedValue(new Response("Meeting notes",{headers:{"content-type":"text/plain"}}));
    expect(await fetchGoogleDoc(link,undefined,call)).toMatchObject({content:"Meeting notes",uri:link});
    expect(String(call.mock.calls[0][0])).toBe(link.replace("edit","export?format=txt"));
  });
  it("does not import login pages or contact arbitrary origins",async()=>{
    expect(()=>googleDocId(link.replace("docs.google.com","unrelated.example"))).toThrow();
    const call=vi.fn().mockResolvedValue(Response.redirect("https://accounts.google.com/",302));
    await expect(fetchGoogleDoc(link,undefined,call)).rejects.toThrow(/sign-in/);
    expect(call).toHaveBeenCalledTimes(1);
  });
  it("checks the private document's download permission before exporting", async()=>{
    const call=vi.fn().mockResolvedValue(Response.json({mimeType:"application/vnd.google-apps.document",capabilities:{canDownload:false}}));
    await expect(fetchGoogleDoc(link,"test-only",call)).rejects.toThrow(/permits downloading/);
    expect(call).toHaveBeenCalledTimes(1);
  });
});
