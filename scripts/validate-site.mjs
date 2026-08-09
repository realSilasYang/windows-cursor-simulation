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
  if (document.querySelector('meta[name="color-scheme"]')?.content !== "dark light") throw new Error(`${label}: incomplete color-scheme support`);

  const languageButton = document.getElementById("languageButton");
  if (languageButton?.querySelectorAll("svg").length !== 1 || languageButton.textContent.trim()) {
    throw new Error(`${label}: language button must contain exactly one icon and no visible text`);
  }
  const themeButton = document.getElementById("themeButton");
  if (themeButton?.querySelectorAll("svg").length !== 1 || themeButton.textContent.trim()) {
    throw new Error(`${label}: theme button must contain exactly one icon and no visible text`);
  }
  const headerOrder = [...document.querySelector(".header-actions")?.children || []].map((element) => element.className);
  if (headerOrder[0] !== "header-status" || headerOrder[1] !== "preference-controls") {
    throw new Error(`${label}: preference controls must be the rightmost header group`);
  }
  if (document.querySelectorAll("#themeMenu [data-theme]").length !== 3) throw new Error(`${label}: expected three theme choices`);
  if (!document.documentElement.dataset.theme || !document.documentElement.dataset.themePreference) {
    throw new Error(`${label}: missing initialized theme state`);
  }
  const footerVisits = document.getElementById("footerVisits");
  if (!footerVisits || !footerVisits.hidden) throw new Error(`${label}: visit counter must wait for live data`);
  const footerOrder = [...document.querySelector(".footer-inner")?.children || []].map((element) => element.id);
  if (footerOrder.join(",") !== "footerSpec,footerCounts,footerVisits") {
    throw new Error(`${label}: visit counter must be the rightmost footer item`);
  }

  const hreflangs = new Set([...document.querySelectorAll('link[rel="alternate"][hreflang]')].map((link) => link.hreflang));
  if (hreflangs.size !== expectedHreflangs.size || [...expectedHreflangs].some((value) => !hreflangs.has(value))) {
    throw new Error(`${label}: incomplete hreflang cluster`);
  }

  const schema = JSON.parse(document.getElementById("structuredData").textContent);
  const graph = schema["@graph"];
  if (!Array.isArray(graph) || !graph.some((item) => item["@type"] === "WebApplication")) throw new Error(`${label}: missing WebApplication schema`);
  const terms = graph.find((item) => item["@type"] === "DefinedTermSet")?.hasDefinedTerm;
  if (!Array.isArray(terms) || terms.length !== 36) throw new Error(`${label}: expected 36 structured cursor terms`);

  const appScript = document.getElementById("applicationScript")?.textContent;
  if (!appScript) throw new Error(`${label}: missing application script`);
  new vm.Script(appScript, { filename: `${label}/index.html` });
  if (!appScript.includes("https://windows-cursor-simulation-stats.realsilasyang.workers.dev/stats")) {
    throw new Error(`${label}: missing public statistics endpoint`);
  }
  if (!appScript.includes("setInterval(loadTotalVisits, STATS_REFRESH_INTERVAL_MS)")) {
    throw new Error(`${label}: missing periodic statistics refresh`);
  }
  if (/url\([^)]*\.(?:cur|ani)/i.test(html)) throw new Error(`${label}: external cursor file reference found`);

  const analyticsScripts = [...document.querySelectorAll('script[src="https://static.cloudflareinsights.com/beacon.min.js"]')];
  if (analyticsScripts.length !== 1) throw new Error(`${label}: expected exactly one Cloudflare Web Analytics beacon`);
  const analyticsScript = analyticsScripts[0];
  if (analyticsScript.type !== "module") throw new Error(`${label}: Cloudflare beacon must use the provided module loader`);
  const analyticsConfig = JSON.parse(analyticsScript.dataset.cfBeacon || "{}");
  if (analyticsConfig.token !== "fe49643173e74721b452221aafe7d9be") throw new Error(`${label}: incorrect Cloudflare beacon token`);

  if (locale.startsWith("zh-")) {
    const walker = document.createTreeWalker(document.body, dom.window.NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (["SCRIPT", "STYLE", "TEMPLATE"].includes(node.parentElement?.tagName)) continue;
      const text = node.textContent.trim();
      if (/\p{Script=Han}/u.test(text) && /[()]/.test(text)) {
        throw new Error(`${label}: Chinese visible text contains half-width parentheses: ${JSON.stringify(text)}`);
      }
    }
  }
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
