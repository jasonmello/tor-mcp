// Turns raw HTML into something an agent can read: title, readable Markdown, links.
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import TurndownService from "turndown";

export interface Extracted {
  title: string;
  markdown: string;
  links: Array<{ text: string; href: string }>;
}

const MAX_LINKS = 80;
export const MAX_MARKDOWN_CHARS = 40_000;

export function extractHtml(html: string, baseUrl: string): Extracted {
  const { document } = parseHTML(html);
  const title = (document.querySelector("title")?.textContent ?? "").trim();

  const links: Extracted["links"] = [];
  const seen = new Set<string>();
  for (const a of Array.from(document.querySelectorAll("a[href]")) as Element[]) {
    const raw = a.getAttribute("href") ?? "";
    let href: string;
    try {
      href = new URL(raw, baseUrl).toString();
    } catch {
      continue;
    }
    if (!/^https?:/.test(href) || seen.has(href)) continue;
    seen.add(href);
    links.push({ text: (a.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 120), href });
    if (links.length >= MAX_LINKS) break;
  }

  for (const el of Array.from(document.querySelectorAll("script, style, noscript, iframe, object, embed")) as Element[]) {
    el.remove();
  }

  let contentHtml = "";
  try {
    // Readability mutates the document; it already lost scripts above, which is fine.
    const article = new Readability(document as unknown as Document).parse();
    contentHtml = article?.content ?? "";
  } catch {
    contentHtml = "";
  }
  if (!contentHtml) contentHtml = document.body?.innerHTML ?? html;

  const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });
  turndown.addRule("dropImages", { filter: ["img", "picture", "svg" as keyof HTMLElementTagNameMap], replacement: () => "" });
  let markdown = turndown.turndown(contentHtml).replace(/\n{3,}/g, "\n\n").trim();
  if (markdown.length > MAX_MARKDOWN_CHARS) {
    markdown = `${markdown.slice(0, MAX_MARKDOWN_CHARS)}\n\n[... truncated at ${MAX_MARKDOWN_CHARS} characters]`;
  }
  return { title, markdown, links };
}
