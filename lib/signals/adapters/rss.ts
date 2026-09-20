import { load } from "cheerio";

export interface FeedEntry {
  title: string;
  url: string;
  publishedAt: string | null;
  publisher: string | null;
  feedUrl: string;
}

// Preserve meaningful path/query differences; discard only known tracking fields.
export function normalizeUrl(value: string, base?: string): string {
  const url = new URL(value, base);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("Expected a public HTTP(S) URL without credentials.");
  }
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (/^utm_/i.test(key) || /^(fbclid|gclid)$/i.test(key)) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  return url.href;
}

export function parseFeed(xml: string, feedUrl: string, publisher?: string): FeedEntry[] {
  const $ = load(xml, { xml: true });
  const atom = $("feed").length > 0;
  if (!atom && !$("rss > channel").length) throw new Error("Unsupported feed: expected RSS or Atom.");
  const source = publisher || $(atom ? "feed > title" : "channel > title").first().text().trim() || null;
  const entries: FeedEntry[] = [];
  $(atom ? "feed > entry" : "channel > item").each((_, element) => {
    const item = $(element);
    const link = atom
      ? item.children("link").filter((_, el) => !$(el).attr("rel") || $(el).attr("rel") === "alternate").first().attr("href")
      : item.children("link").first().text().trim() || item.children('guid[isPermaLink="true"]').text().trim();
    if (!link) return;
    let url: string;
    try { url = normalizeUrl(link, item.attr("xml:base") || $("feed").attr("xml:base") || feedUrl); }
    catch { return; }
    const date = item.children(atom ? "published" : "pubDate").first().text().trim()
      || item.children(atom ? "updated" : "dc\\:date").first().text().trim();
    entries.push({
      title: item.children("title").first().text().trim(), url,
      publishedAt: date && Number.isFinite(Date.parse(date)) ? new Date(date).toISOString() : null,
      publisher: item.children("source").first().text().trim() || source,
      feedUrl,
    });
  });
  return entries;
}

export async function fetchFeed(feed: { url: string; publisher?: string }): Promise<FeedEntry[]> {
  const response = await fetch(normalizeUrl(feed.url), {
    signal: AbortSignal.timeout(20_000),
    headers: { Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" },
  });
  if (!response.ok) throw new Error(`Feed returned HTTP ${response.status}.`);
  const xml = await response.text();
  if (xml.length > 2_000_000) throw new Error("Feed is too large.");
  return parseFeed(xml, response.url || feed.url, feed.publisher);
}
