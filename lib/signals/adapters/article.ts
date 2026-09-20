import { createHash } from "node:crypto";
import { load } from "cheerio";
import type { NormalizedDocument } from "../types";
import { normalizeUrl, type FeedEntry } from "./rss";

const clean = (value: unknown): string => typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

function publicationDate(...values: unknown[]): string | null {
  for (const value of values) {
    const text = clean(value);
    // Do not infer a timezone for a local timestamp or accept rolled-over calendar dates.
    if (!/^\d{4}-\d{2}-\d{2}(?:T.*(?:Z|[+-]\d{2}:?\d{2}))?$/.test(text)) continue;
    const day = text.slice(0, 10);
    const time = Date.parse(text);
    if (Number.isFinite(time) && new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) === day) return text;
  }
  return null;
}

export function normalizeArticleHtml(html: string, entry: FeedEntry, retrievedAt: string, fetchedUrl = entry.url): NormalizedDocument {
  if (!Number.isFinite(Date.parse(retrievedAt))) throw new Error("Article adapter: invalid retrieval time.");
  const $ = load(html);
  const meta = (key: string) => clean($(`meta[property="${key}"], meta[name="${key}"]`).first().attr("content"));
  const articles: Record<string, unknown>[] = [];
  function visit(value: unknown) {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    const node = object(value);
    const types = Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]];
    if (types.some((type) => typeof type === "string" && /^(?:https?:\/\/schema.org\/)?(?:Article|NewsArticle|ReportageNewsArticle|BlogPosting)$/.test(type))) articles.push(node);
    if (node["@graph"]) visit(node["@graph"]);
  }
  $('script[type="application/ld+json"]').each((_, element) => {
    try { visit(JSON.parse($(element).text())); } catch { /* Invalid optional metadata is ignored. */ }
  });
  // Multiple article entities often indicate a listing page: do not guess which one is the story.
  const structured = articles.length === 1 ? articles[0] : {};
  const rawCanonical = $('link[rel~="canonical"]').first().attr("href")
    || clean(structured.url) || clean(object(structured.mainEntityOfPage)["@id"]);
  let url = normalizeUrl(fetchedUrl);
  if (rawCanonical) {
    try { url = normalizeUrl(rawCanonical, fetchedUrl); } catch { /* Keep the fetched URL. */ }
  }
  const title = meta("og:title") || clean(structured.headline) || clean($("h1").first().text()) || clean(entry.title) || clean($("title").text());
  const publisher = meta("og:site_name") || clean(object(structured.publisher).name) || clean(entry.publisher);
  const publishedAt = publicationDate(meta("article:published_time"), structured.datePublished,
    $('[itemprop="datePublished"]').first().attr("content"), $('article time[datetime]').first().attr("datetime"), entry.publishedAt);

  $("script, style, noscript, nav, footer, aside, form, iframe, svg, button, [hidden], [aria-hidden='true'], [role='navigation'], [role='dialog'], [role='banner'], [role='contentinfo']").remove();
  // Match chrome tokens, not arbitrary substrings in article text.
  $("[id], [class]").each((_, element) => {
    if ($(element).is("html, body, main, article, .main, .entry-content") || $(element).find("main, article, .entry-content").length) return;
    if (/(?:^|[\s_-])(?:cookie|consent|advertisement|advert|social|share|sharing|related|newsletter|comments|breadcrumb|sidebar|menu|paywall)(?:$|[\s_-])/i.test(`${$(element).attr("id") ?? ""} ${$(element).attr("class") ?? ""}`)) $(element).remove();
  });
  $("body > header").remove();

  const officialProject = ['engage.pittsburghpa.gov', 'engage.rideprt.org'].includes(new URL(fetchedUrl).hostname);
  let root = officialProject ? $('main .main, main.main').first() : $('[itemprop="articleBody"]');
  if (officialProject) root.find('.modal, .sidebar, .hive-block-survey, .hive-block-comments').remove();
  if (!root.length) root = $("article");
  if (!root.length) root = $("main, [role='main']");
  if (!root.length) root = $(".article-body, .article-content, .entry-content, .post-content");
  if (root.length > 1) throw new Error("Article adapter: ambiguous article containers.");

  let text = "";
  if (root.length) {
    root.find("header nav, header .byline").remove();
    const allText = clean(root.text());
    const linkText = clean(root.find("a").text());
    if (linkText.length > allText.length * 0.5) throw new Error("Article adapter: content is mostly links.");
    root.find("br").replaceWith("\n");
    root.find("p, div, section, h1, h2, h3, h4, blockquote, li, tr").prepend("\n\n").append("\n\n");
    text = root.text().split(/\n+/).map((line) => clean(line)).filter(Boolean).join("\n\n");
  } else if (typeof structured.articleBody === "string") {
    // Only a full Article body is a fallback; descriptions and the entire page are never used.
    text = structured.articleBody.split(/\n+/).map((line) => clean(line)).filter(Boolean).join("\n\n");
    if (/<\/?[a-z][^>]*>/i.test(text)) throw new Error("Article adapter: JSON-LD body is not plain text.");
  }
  if (!title || text.length < 300 || text.length > 40_000 || text.split(/\s+/u).length < 50) {
    throw new Error("Article adapter: article text is missing, sparse, or too large.");
  }
  const contentHash = createHash("sha256").update(text).digest("hex");
  return {
    id: createHash("sha256").update(`${url}\n${contentHash}`).digest("hex"),
    source: { title, url, publisher, publishedAt }, sourceType: "html", text,
    provenance: { retrievedAt, adapterVersion: "general-article-html-v1", contentHash },
  };
}

export async function ingestArticle(entry: FeedEntry): Promise<NormalizedDocument> {
  const response = await fetch(normalizeUrl(entry.url), {
    signal: AbortSignal.timeout(20_000), headers: { Accept: "text/html, application/xhtml+xml" },
  });
  if (!response.ok) throw new Error(`Article adapter: HTTP ${response.status}.`);
  if (!/^(text\/html|application\/xhtml\+xml)(?:;|$)/i.test(response.headers.get("content-type") ?? "")) throw new Error("Article adapter: expected HTML.");
  const html = await response.text();
  if (html.length > 2_000_000) throw new Error("Article adapter: HTML is too large.");
  return normalizeArticleHtml(html, entry, new Date().toISOString(), response.url || entry.url);
}
