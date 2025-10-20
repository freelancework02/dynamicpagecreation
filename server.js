import express from "express";
import path from "path";
import fetch from "node-fetch";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

const API_BASE = "https://masailworld.onrender.com/api/article";
const CACHE_TTL_MS = 30 * 1000; // 30 sec cache
const cache = { list: null, items: new Map() };

// Fetch JSON helper
async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  return res.json();
}

// Strip HTML helper for description
function stripHtml(html) {
  return html ? html.replace(/<\/?[^>]+(>|$)/g, "") : "";
}

// Compute base URL for OG meta
function getServerBaseUrl(req) {
  const host = req.get("x-forwarded-host") || req.get("host");
  const proto = req.get("x-forwarded-proto") || req.protocol;
  return `${proto}://${host}`;
}

// ✅ Route: /pages (article list)
app.get("/pages", async (req, res) => {
  try {
    const now = Date.now();
    if (cache.list && now - cache.list.ts < CACHE_TTL_MS) {
      return res.render("index", { articles: cache.list.data });
    }

    const data = await fetchJson(API_BASE);
    const articles = Array.isArray(data.data) ? data.data : [];
    cache.list = { data: articles, ts: now };

    res.render("index", { articles });
  } catch (err) {
    console.error("Error fetching list:", err);
    res.status(500).send("Server error fetching articles.");
  }
});

// ✅ Route: /pages/:id (single article)
app.get("/pages/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const now = Date.now();

    // check cache
    if (cache.items.has(id) && now - cache.items.get(id).ts < CACHE_TTL_MS) {
      return renderArticle(res, req, cache.items.get(id).data);
    }

    const json = await fetchJson(`${API_BASE}/${id}`);
    let article = json?.data;
    if (Array.isArray(article)) article = article[0];
    if (!article) return res.status(404).send("Article not found");

    cache.items.set(id, { data: article, ts: now });
    renderArticle(res, req, article);
  } catch (err) {
    console.error("Error fetching article:", err);
    res.status(500).send("Server error fetching article.");
  }
});

// ✅ Helper: Render article with OG tags
function renderArticle(res, req, article) {
  const imageUrl = `${API_BASE}/${article.id}/image`;
  let description = article.seo || "";

  if (!description && article.ArticleText)
    description = stripHtml(article.ArticleText).slice(0, 160);

  const meta = {
    title: article.Title || "Article",
    description,
    image: imageUrl,
    url: `${getServerBaseUrl(req)}/pages/${article.id}`
  };

  res.render("pages/article", { article, meta });
}

// Root redirect
app.get("/", (req, res) => res.redirect("/pages"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`✅ Server running: http://localhost:${PORT}/pages`)
);
