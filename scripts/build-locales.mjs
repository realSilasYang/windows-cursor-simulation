import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM, VirtualConsole } from "jsdom";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePagePath = join(projectRoot, "src", "index.html");
const publicDirectory = join(projectRoot, "public");
const outputDirectory = join(projectRoot, "dist");
const rootPagePath = join(outputDirectory, "index.html");
const siteUrl = "https://realsilasyang.github.io/windows-cursor-simulation/";
const lastModified = "2026-08-10";
const locales = [
  ["zh-CN", "zh-cn"],
  ["zh-HK", "zh-hk"],
  ["zh-TW", "zh-tw"],
  ["en", "en"],
  ["ja", "ja"],
  ["vi", "vi"],
  ["ko", "ko"],
  ["es", "es"],
  ["fr", "fr"],
  ["pt-BR", "pt-br"],
  ["pt-PT", "pt-pt"],
  ["ru", "ru"],
  ["de", "de"],
  ["it", "it"]
];

function renderPage(source, locale, route) {
  const virtualConsole = new VirtualConsole();
  const errors = [];
  virtualConsole.on("jsdomError", (error) => errors.push(error));

  const dom = new JSDOM(source, {
    url: route ? `${siteUrl}${route}/` : siteUrl,
    runScripts: "dangerously",
    virtualConsole,
    beforeParse(window) {
      Object.defineProperty(window.navigator, "languages", {
        configurable: true,
        value: [locale]
      });
      Object.defineProperty(window.navigator, "language", {
        configurable: true,
        value: locale
      });
      Object.defineProperty(window.navigator, "platform", {
        configurable: true,
        value: "Win32"
      });
      window.localStorage.setItem("windows-cursor-simulation.locale", route ? locale : "auto");
    }
  });

  if (errors.length) throw errors[0];
  const { document } = dom.window;
  if (document.documentElement.lang !== locale) {
    throw new Error(`Expected ${locale}, received ${document.documentElement.lang}`);
  }
  if (document.querySelectorAll(".cursor-card").length !== 36) {
    throw new Error(`Expected 36 cursor cards for ${locale}`);
  }

  const serialized = dom.serialize().trimEnd();
  const output = `${serialized.replace(/\s*<\/body><\/html>$/, "\n</body></html>")}\n`;
  dom.window.close();
  return output;
}

function escapeXml(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function sitemapEntry(url) {
  const alternates = [
    ["x-default", siteUrl],
    ...locales.map(([locale, route]) => [locale, `${siteUrl}${route}/`])
  ].map(([locale, href]) => `    <xhtml:link rel="alternate" hreflang="${locale}" href="${escapeXml(href)}" />`).join("\n");

  return `  <url>\n    <loc>${escapeXml(url)}</loc>\n    <lastmod>${lastModified}</lastmod>\n${alternates}\n  </url>`;
}

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
await cp(publicDirectory, outputDirectory, { recursive: true });

const source = await readFile(sourcePagePath, "utf8");
const rootOutput = renderPage(source, "zh-CN", null);
const localizedOutputs = locales.map(([locale, route]) => ({
  locale,
  route,
  output: renderPage(source, locale, route)
}));

await writeFile(rootPagePath, rootOutput, "utf8");
for (const { route, output } of localizedOutputs) {
  const outputPath = join(outputDirectory, route, "index.html");
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, output, "utf8");
}

const sitemapUrls = [siteUrl, ...locales.map(([, route]) => `${siteUrl}${route}/`)];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${sitemapUrls.map(sitemapEntry).join("\n")}
</urlset>
`;
await writeFile(join(outputDirectory, "sitemap.xml"), sitemap, "utf8");

console.log(`Generated root page, ${localizedOutputs.length} localized pages, and static resources in dist/.`);
