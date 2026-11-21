import { afterEach, describe, expect, it, vi } from "vitest";
import { wikipedia, sejm, arxiv, htmlText } from "@/server/source-adapters";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const signal = () => new AbortController().signal;

describe("direct public source adapters", () => {
  it("retrieves Wikipedia article text and links the exact revision", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          query: { search: [{ pageid: 12, title: "Polska w NATO" }] },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          parse: {
            revid: 123,
            text: '<p>Polska jest członkiem NATO od 12 marca 1999 roku.</p><script>ignore me</script><sup class="reference">[1]</sup>',
          },
        }),
      );
    vi.stubGlobal("fetch", fetcher);
    const { hits } = await wikipedia("Polska NATO", signal());
    expect(hits[0].url).toContain("oldid=123");
    expect(hits[0].canonicalUrl).toBe(
      "https://pl.wikipedia.org/wiki/Polska_w_NATO",
    );
    expect(hits[0].raw_content).toBe(
      "Polska jest członkiem NATO od 12 marca 1999 roku.",
    );
    expect(hits[0].contentScope).toBe("text");
    expect(fetcher.mock.calls[0][0].searchParams.get("srsearch")).toBe(
      "Polska NATO",
    );
  });
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
  it("parses arXiv abstracts without claiming full text or peer review", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(
          `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry><id>http://arxiv.org/abs/1706.03762v7</id><title>Attention Is All You Need</title><summary>We propose a new simple network architecture, the Transformer, based solely on attention mechanisms.</summary><published>2017-06-12T17:57:34Z</published></entry></feed>`,
        ),
      );
    vi.stubGlobal("fetch", fetcher);
    const { hits } = await arxiv("attention transformer", signal());
    expect(hits[0].contentScope).toBe("abstract");
    expect(hits[0].canonicalUrl).toBe("https://arxiv.org/abs/1706.03762");
    expect(hits[0].notes?.[0]).toContain("nie potwierdza recenzji");
    expect(fetcher.mock.calls[0][0].searchParams.get("search_query")).toBe(
      'all:"attention" AND all:"transformer"',
    );
  });
  it("preserves paragraph boundaries and removes embedded instructions in scripts", () => {
    expect(
      htmlText(
        "<p>First paragraph</p><p>Second paragraph</p><style>hidden</style>",
      ),
    ).toBe("First paragraph\n\nSecond paragraph");
  });
  it("cancels a queued arXiv request promptly without letting later requests overtake", async () => {
    const now = Date.now() + 10_000;
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    let completeFirst!: (response: Response) => void;
    const fetcher = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            completeFirst = resolve;
          }),
      )
      .mockImplementation(() => Promise.resolve(new Response("<feed/>")));
    vi.stubGlobal("fetch", fetcher);
    const first = arxiv("first query", signal());
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));

    const controller = new AbortController();
    const cancelled = arxiv("cancelled query", controller.signal);
    const rejection = expect(cancelled).rejects.toThrow();
    controller.abort();
    await rejection;

    clock.mockReturnValue(now + 3000);
    const third = arxiv("third query", signal());
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(fetcher).toHaveBeenCalledTimes(1);
    completeFirst(new Response("<feed/>"));
    await Promise.all([first, third]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("rejects an oversized response before parsing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("x".repeat(3_000_001))),
    );
    await expect(wikipedia("Polska", signal())).rejects.toThrow("too large");
  });
});
