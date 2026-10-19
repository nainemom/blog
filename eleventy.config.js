import fs from "node:fs";
import { HtmlBasePlugin } from "@11ty/eleventy";
import { feedPlugin } from "@11ty/eleventy-plugin-rss";
import markdownIt from "markdown-it";
import * as sass from "sass";
import site from "./_data/site.js";

const md = markdownIt({ html: true });

// Jalali (Persian calendar) date formatting, replaces the old jdate Ruby plugin.
// Supports %A (weekday), %d (day), %m (month number), %b/%B (month name), %y/%Y (year).
function jdate(date, format = "%Y/%m/%d") {
  const parts = {};
  const formatter = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    timeZone: "UTC",
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  for (const { type, value } of formatter.formatToParts(new Date(date))) {
    parts[type] = value;
  }
  const monthNumber = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    timeZone: "UTC",
    month: "2-digit",
  }).format(new Date(date));
  return format.replace(/%([AdmbBYy])/g, (_, key) => ({
    A: parts.weekday,
    d: parts.day,
    m: monthNumber,
    b: parts.month,
    B: parts.month,
    Y: parts.year,
    y: parts.year.slice(-2),
  })[key]);
}

// Same idea as Jekyll's slugify: keep (Persian) letters and digits, everything else becomes "-".
function archiveSlug(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

// Jekyll-style excerpt: the first paragraph of the post, rendered to HTML.
const excerptCache = new Map();
function excerpt(item) {
  const inputPath = item.inputPath ?? item.page?.inputPath;
  if (!excerptCache.has(inputPath)) {
    const body = fs
      .readFileSync(inputPath, "utf8")
      .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "")
      .trim();
    const firstParagraph = body
      .split(/\r?\n\s*\r?\n/)[0]
      .replace(/\{\{\s*site\.url\s*\}\}/g, site.url);
    excerptCache.set(inputPath, md.render(firstParagraph));
  }
  return excerptCache.get(inputPath);
}

function uniqueNewestFirst(posts, getValues) {
  return [...new Set(posts.slice().reverse().flatMap(getValues))].filter(Boolean);
}

export default function (eleventyConfig) {
  eleventyConfig.setLibrary("md", md);
  eleventyConfig.addPlugin(HtmlBasePlugin);
  eleventyConfig.addPlugin(feedPlugin, {
    type: "atom",
    outputPath: "/feed.xml",
    collection: { name: "posts", limit: 10 },
    metadata: {
      language: "fa",
      title: site.title,
      subtitle: site.description,
      base: site.origin + "/",
      author: { name: site.author, email: site.email },
    },
  });

  eleventyConfig.addPassthroughCopy("font");
  eleventyConfig.ignores.add("_sass/**");
  eleventyConfig.ignores.add("README.md");
  eleventyConfig.addWatchTarget("_sass/");

  // Posts keep their Jekyll URLs: _posts/2017-05-13-so-what.md -> /so-what/
  eleventyConfig.addGlobalData("permalink", () => (data) => {
    if (data.page.inputPath.startsWith("./_posts/")) {
      return `/${data.page.fileSlug}/`;
    }
    return `${data.page.filePathStem}.${data.page.outputFileExtension}`;
  });

  // Oldest first, as Eleventy (and the feed plugin) expect.
  eleventyConfig.addCollection("posts", (api) => api.getFilteredByGlob("_posts/*.md"));
  eleventyConfig.addCollection("tagList", (api) =>
    uniqueNewestFirst(api.getFilteredByGlob("_posts/*.md"), (post) => post.data.tags ?? []),
  );
  eleventyConfig.addCollection("categoryList", (api) =>
    uniqueNewestFirst(api.getFilteredByGlob("_posts/*.md"), (post) => [post.data.category]),
  );

  eleventyConfig.addFilter("jdate", jdate);
  eleventyConfig.addFilter("archiveSlug", archiveSlug);
  eleventyConfig.addFilter("excerpt", excerpt);
  eleventyConfig.addFilter("findByUrl", (posts, url) => posts.find((post) => post.url === url));
  eleventyConfig.addFilter("withTag", (posts, tag) =>
    posts.filter((post) => (post.data.tags ?? []).includes(tag)).reverse(),
  );
  eleventyConfig.addFilter("withCategory", (posts, category) =>
    posts.filter((post) => post.data.category === category).reverse(),
  );
  // Posts sharing a tag with `post`, newest first, without duplicates.
  eleventyConfig.addFilter("related", (posts, post) => {
    const seen = new Set([post.url]);
    const result = [];
    const newestFirst = posts.slice().reverse();
    for (const tag of post.data.tags ?? []) {
      for (const other of newestFirst) {
        if (!seen.has(other.url) && (other.data.tags ?? []).includes(tag)) {
          seen.add(other.url);
          result.push(other);
        }
      }
    }
    return result;
  });

  eleventyConfig.addTemplateFormats("scss");
  eleventyConfig.addExtension("scss", {
    outputFileExtension: "css",
    useLayouts: false,
    compile(inputContent) {
      const result = sass.compileString(inputContent, {
        loadPaths: ["_sass"],
        style: "compressed",
      });
      return () => result.css;
    },
  });
}

export const config = {
  dir: {
    input: ".",
    includes: "_includes",
    layouts: "_layouts",
    data: "_data",
    output: "_site",
  },
  pathPrefix: "/blog/",
  markdownTemplateEngine: "liquid",
  htmlTemplateEngine: "liquid",
  templateFormats: ["md", "html", "liquid", "njk"],
};
