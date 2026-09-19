import { createHash } from "node:crypto";
import { load } from "cheerio";
import type { NormalizedDocument } from "../types";

// The City's official copy of the requested press release.
export const PRESS_RELEASE_URL = "https://content.govdelivery.com/accounts/PAPITT/bulletins/40df652";
const EXPECTED_TITLE = "Mayor Corey O’Connor Provides Transparent and Honest Update on City’s Financial Position";

function repairMojibake(text: string): string {
  // Repair common UTF-8 bytes misread as Windows-1252/Latin-1, not valid Unicode.
  const decoder = new TextDecoder("windows-1252");
  for (let pass = 0; pass < 2; pass++) {
    for (const character of "‘’“”–—…\u00a0éèêáàâäöüñç") {
      const bytes = Buffer.from(character, "utf8");
      for (const broken of [decoder.decode(bytes), bytes.toString("latin1")]) {
        text = text.split(broken).join(character);
      }
    }
  }
  return text;
}

export function normalizeHtml(html: string, retrievedAt: string): NormalizedDocument {
  const $ = load(html);
  $("script, style, noscript, nav, footer, form").remove();

  function readText(element: ReturnType<typeof $>): string {
    let text = "";
    element.contents().each((_, node) => {
      const next = node.type === "text" ? repairMojibake(node.data) : readText($(node));
      // Adjacent text nodes across inline tags must not silently join words.
      if (/[\p{L}\p{N}]$/u.test(text) && /^[\p{L}\p{N}]/u.test(next)) text += " ";
      text += next;
    });
    return text;
  }

  const title = readText($("h1").first()).replace(/\s+/g, " ").trim();
  if (title !== EXPECTED_TITLE) {
    throw new Error("HTML adapter: expected Pittsburgh press release title was not found.");
  }

  // Preserve word boundaries across HTML blocks; exclude the bulletin footer.
  $("br").replaceWith("\n");
  $("p, div, h1, h2, h3, li, tr").append("\n");
  const pageText = readText($("body")).replace(/\s+/g, " ").trim();
  const start = pageText.indexOf("FOR IMMEDIATE RELEASE");
  const end = pageText.indexOf("Stay Connected with City of Pittsburgh", start);
  if (start < 0 || end <= start) {
    throw new Error("HTML adapter: press release body boundaries were not found.");
  }
  const text = pageText.slice(start, end).trim();
  const date = pageText.match(/sent this bulletin at (\d{2})\/(\d{2})\/(\d{4})/i);
  if (!date) throw new Error("HTML adapter: publication date was not found.");
  const publishedAt = `${date[3]}-${date[1]}-${date[2]}`;
  if (!Number.isFinite(Date.parse(publishedAt)) ||
      new Date(publishedAt).toISOString().slice(0, 10) !== publishedAt ||
      !Number.isFinite(Date.parse(retrievedAt))) {
    throw new Error("HTML adapter: invalid publication or retrieval date.");
  }
  if (text.length < 200 || text.length > 40_000) {
    throw new Error("HTML adapter: unexpected article length.");
  }
  const contentHash = createHash("sha256").update(text).digest("hex");
  const id = createHash("sha256").update(`${PRESS_RELEASE_URL}\n${contentHash}`).digest("hex");
  return {
    id,
    source: { title, url: PRESS_RELEASE_URL, publisher: "City of Pittsburgh", publishedAt },
    sourceType: "html",
    text,
    provenance: { retrievedAt, adapterVersion: "pittsburgh-govdelivery-html-v2", contentHash },
  };
}

export async function ingestHtml(): Promise<NormalizedDocument> {
  const response = await fetch(PRESS_RELEASE_URL, {
    signal: AbortSignal.timeout(20_000),
    redirect: "error",
    headers: { Accept: "text/html" },
  }).catch(() => { throw new Error("HTML adapter: press release fetch failed or timed out."); });
  if (!response.ok) throw new Error(`HTML adapter: source returned HTTP ${response.status}.`);
  if (!response.headers.get("content-type")?.includes("text/html")) {
    throw new Error("HTML adapter: source did not return HTML.");
  }
  const html = await response.text();
  if (html.length > 2_000_000) throw new Error("HTML adapter: source HTML is too large.");
  return normalizeHtml(html, new Date().toISOString());
}
