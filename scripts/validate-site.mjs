import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { JSDOM } from "jsdom";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const siteUrl = "https://realsilasyang.github.io/windows-cursor-simulation/";
const locales = [
  ["zh-CN", "zh-cn"], ["zh-HK", "zh-hk"], ["zh-TW", "zh-tw"], ["en", "en"],
  ["ja", "ja"], ["vi", "vi"], ["ko", "ko"], ["es", "es"], ["fr", "fr"],
  ["pt-BR", "pt-br"], ["pt-PT", "pt-pt"], ["ru", "ru"], ["de", "de"], ["it", "it"]
];
const pages = [["zh-CN", "", siteUrl], ...locales.map(([locale, route]) => [locale, route, `${siteUrl}${route}/`])];
const expectedHreflangs = new Set(["x-default", ...locales.map(([locale]) => locale)]);

for (const [locale, route, canonical] of pages) {
  const html = await readFile(join(projectRoot, route, "index.html"), "utf8");
  const dom = new JSDOM(html);
  const { document } = dom.window;
  const label = route || "root";

  if (document.documentElement.lang !== locale) throw new Error(`${label}: incorrect html lang`);
  if (!document.title || document.title.length > 65) throw new Error(`${label}: invalid title length`);
  const description = document.querySelector('meta[name="description"]')?.content || "";
  if (description.length < 45 || description.length > 180) throw new Error(`${label}: invalid description length ${description.length}`);
  if (document.querySelector('link[rel="canonical"]')?.href !== canonical) throw new Error(`${label}: incorrect canonical`);
  if (document.querySelector('meta[property="og:url"]')?.content !== canonical) throw new Error(`${label}: incorrect og:url`);
  if (!document.querySelector('meta[property="og:image"]')?.content.endsWith("/og-image.png")) throw new Error(`${label}: missing og:image`);
  if (document.querySelector('meta[name="twitter:card"]')?.content !== "summary_large_image") throw new Error(`${label}: missing Twitter card`);
  if (document.querySelectorAll(".cursor-card").length !== 36) throw new Error(`${label}: expected 36 static cards`);

  const hreflangs = new Set([...document.querySelectorAll('link[rel="alternate"][hreflang]')].map((link) => link.hreflang));
  if (hreflangs.size !== expectedHreflangs.size || [...expectedHreflangs].some((value) => !hreflangs.has(value))) {
    throw new Error(`${label}: incomplete hreflang cluster`);
  }

  const schema = JSON.parse(document.getElementById("structuredData").textContent);
  const graph = schema["@graph"];
  if (!Array.isArray(graph) || !graph.some((item) => item["@type"] === "WebApplication")) throw new Error(`${label}: missing WebApplication schema`);
  const terms = graph.find((item) => item["@type"] === "DefinedTermSet")?.hasDefinedTerm;
  if (!Array.isArray(terms) || terms.length !== 36) throw new Error(`${label}: expected 36 structured cursor terms`);

  const appScript = [...document.scripts].find((script) => !script.type)?.textContent;
  new vm.Script(appScript, { filename: `${label}/index.html` });
  if (/url\([^)]*\.(?:cur|ani)/i.test(html)) throw new Error(`${label}: external cursor file reference found`);
  dom.window.close();
}

const sitemap = await readFile(join(projectRoot, "sitemap.xml"), "utf8");
const sitemapLocations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
if (sitemapLocations.length !== pages.length) throw new Error(`Sitemap contains ${sitemapLocations.length} URLs, expected ${pages.length}`);
for (const [, , canonical] of pages) if (!sitemapLocations.includes(canonical)) throw new Error(`Sitemap is missing ${canonical}`);

for (const requiredFile of ["robots.txt", "llms.txt", "llms-full.txt", "og-image.png"]) {
  await readFile(join(projectRoot, requiredFile));
}

console.log(`Validated ${pages.length} pages, 36 cursor terms per page, hreflang clusters, schema, sitemap, and GEO files.`);
