import { afterEach, describe, expect, it, vi } from "vitest";
import { sejm, htmlText } from "@/server/source-adapters";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const signal = () => new AbortController().signal;

describe("direct public source adapters", () => {
  it("labels PDF-only Sejm records as metadata and never invents full text", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      Response.json({
        items: [
          {
            ELI: "DU/1997/483",
            title: "Konstytucja Rzeczypospolitej Polskiej",
            textHTML: false,
            announcementDate: "1997-04-02",
            status: "obowiązujący",
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetcher);
    const { hits } = await sejm(
      "Konstytucja Rzeczypospolitej Polskiej",
      signal(),
    );
    expect(hits[0].contentScope).toBe("metadata");
    expect(hits[0].published_date).toBeNull();
    expect(hits[0].raw_content).toContain('"announcementDate": "1997-04-02"');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("uses official HTML when available", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json({
            items: [{ ELI: "DU/2020/1", title: "Testowy akt", textHTML: true }],
          }),
        )
        .mockResolvedValueOnce(
          new Response(
            "<p>Art. 1. Treść przepisu stanowi materiał źródłowy.</p>",
          ),
        ),
    );
    const { hits } = await sejm("Testowy akt", signal());
    expect(hits[0].url).toBe(
      "https://api.sejm.gov.pl/eli/acts/DU/2020/1/text.html",
    );
    expect(hits[0].contentScope).toBe("text");
  });
  it("falls back to metadata with a partial status when HTML fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json({
            items: [{ ELI: "DU/2020/1", title: "Testowy akt", textHTML: true }],
          }),
        )
        .mockResolvedValueOnce(new Response("Unavailable", { status: 503 })),
    );
    const batch = await sejm("Testowy akt", signal());
    expect(batch.partial).toBe(true);
    expect(batch.hits[0].contentScope).toBe("metadata");
  });
  it("rejects malformed act IDs before fetching a document", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      Response.json({
        items: [{ ELI: "../../secret", title: "Bad", textHTML: true }],
      }),
    );
    vi.stubGlobal("fetch", fetcher);
    await expect(sejm("Testowy akt", signal())).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("preserves paragraph boundaries and removes embedded instructions in scripts", () => {
    expect(
      htmlText(
        "<p>First paragraph</p><p>Second paragraph</p><style>hidden</style>",
      ),
    ).toBe("First paragraph\n\nSecond paragraph");
  });
  it("rejects an oversized response before parsing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("x".repeat(3_000_001))),
    );
    await expect(sejm("Polska", signal())).rejects.toThrow("too large");
  });
});
