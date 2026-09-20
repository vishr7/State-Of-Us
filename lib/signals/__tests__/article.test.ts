import { afterEach, describe, expect, it, vi } from "vitest";
import { ingestArticle, normalizeArticleHtml } from "../adapters/article";
import type { FeedEntry } from "../adapters/rss";

const entry: FeedEntry = { title: "Feed title", url: "https://example.org/story?utm_source=feed", publisher: "Feed publisher", publishedAt: "2026-09-18T12:00:00Z", feedUrl: "https://example.org/feed" };
const retrievedAt = "2026-09-19T12:00:00Z";
const first = "The city’s public works department announced a new street improvement project on Friday. Officials said the project would replace worn surfaces and improve pedestrian crossings along several neighborhood streets. Residents can attend a public meeting to review the proposed work and provide comments.";
const second = "The announcement describes the project as proposed—not completed. City staff will publish a detailed construction schedule after the public comment period closes. The department said further information would be included in the next public report, alongside an explanation of funding and the review process.";
const body = `<p>${first}</p><p>${second}</p>`;
const normalize = (html: string, item = entry) => normalizeArticleHtml(html, item, retrievedAt);
afterEach(() => vi.unstubAllGlobals());

describe("general article adapter", () => {
  it("extracts semantic content and metadata, removing chrome while preserving paragraphs and Unicode", () => {
    const doc = normalize(`<html><head><meta property="og:title" content="Street improvements"><meta property="og:site_name" content="City News"><meta property="article:published_time" content="2026-09-17T09:00:00-04:00"><link rel="canonical" href="/canonical?utm_source=rss#top"></head><body><header>Top banner</header><nav>Navigation</nav><article><h1>Street improvements</h1>${body}<div class="cookie-banner">Accept cookies</div><aside>Related links</aside><div class="social-share">Share this</div><script>bad script</script><style>bad style</style><footer>Footer links</footer></article></body></html>`);
    expect(doc.source).toEqual({ title: "Street improvements", publisher: "City News", publishedAt: "2026-09-17T09:00:00-04:00", url: "https://example.org/canonical" });
    expect(doc.text).toBe(`Street improvements\n\n${first}\n\n${second}`);
    expect(doc.provenance).toMatchObject({ retrievedAt, adapterVersion: "general-article-html-v1", contentHash: expect.stringMatching(/^[a-f0-9]{64}$/) });
  });
  it("uses JSON-LD article metadata inside @graph", () => {
    const json = { "@graph": [{ "@type": "WebSite", name: "Other" }, { "@type": "NewsArticle", headline: "Structured headline", publisher: { name: "Structured publisher" }, datePublished: "2026-09-17", mainEntityOfPage: { "@id": "https://example.org/canonical" } }] };
    expect(normalize(`<script type="application/ld+json">${JSON.stringify(json)}</script><main>${body}</main>`).source).toEqual({ title: "Structured headline", publisher: "Structured publisher", publishedAt: "2026-09-17", url: "https://example.org/canonical" });
  });
  it("uses a full JSON-LD articleBody when no semantic container exists", () => {
    const json = { "@type": "Article", headline: "Structured headline", articleBody: `${first}\n${second}` };
    expect(normalize(`<script type="application/ld+json">${JSON.stringify(json)}</script><div>Unrelated page</div>`).text).toBe(`${first}\n\n${second}`);
  });
  it("falls back to feed metadata and a known article body class", () => {
    expect(normalize(`<script type="application/ld+json">invalid</script><div class="entry-content">${body}</div>`).source).toEqual({ title: entry.title, publisher: entry.publisher, publishedAt: entry.publishedAt, url: "https://example.org/story" });
  });
  it("does not invent missing metadata and ignores invalid metadata", () => {
    const doc = normalize(`<meta property="article:published_time" content="2026-02-30"><link rel="canonical" href="javascript:bad"><article><h1>Actual title</h1>${body}</article>`, { ...entry, publisher: null, publishedAt: null });
    expect(doc.source).toMatchObject({ publisher: "", publishedAt: null, url: "https://example.org/story", title: "Actual title" });
  });
  it("rejects sparse content, entire-page fallbacks, multiple articles and link lists", () => {
    for (const html of ["<article><p>Too short</p></article>", `<div>${body}</div>`, `<article>${body}</article><article>${body}</article>`, `<main><a href="/other">${first}${second}</a></main>`]) {
      expect(() => normalize(html)).toThrow("Article adapter:");
    }
  });
  it("rejects missing titles and oversized bodies", () => {
    expect(() => normalize(`<article>${body}</article>`, { ...entry, title: "" })).toThrow();
    expect(() => normalize(`<article>${body.repeat(100)}</article>`)).toThrow();
  });
  it("hashes identical content consistently independent of retrieval time", () => {
    const one = normalize(`<article>${body}</article>`);
    const two = normalizeArticleHtml(`<article>${body}</article>`, entry, "2026-09-20T12:00:00Z");
    expect(one.id).toBe(two.id);
    expect(one.provenance.contentHash).toBe(two.provenance.contentHash);
  });
  it("fetches HTML and resolves relative canonical URLs against the redirect destination", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, url: "https://news.example.org/news/story", headers: new Headers({ "content-type": "text/html; charset=utf-8" }), text: async () => `<link rel="canonical" href="./canonical"><article>${body}</article>` })));
    expect((await ingestArticle(entry)).source.url).toBe("https://news.example.org/news/canonical");
  });
  it("fails cleanly for HTTP errors, non-HTML and network failures", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("Error", { status: 503 })));
    await expect(ingestArticle(entry)).rejects.toThrow("HTTP 503");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { headers: { "content-type": "application/json" } })));
    await expect(ingestArticle(entry)).rejects.toThrow("expected HTML");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network unavailable"); }));
    await expect(ingestArticle(entry)).rejects.toThrow("network unavailable");
  });
});
