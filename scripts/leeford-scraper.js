import axios from "axios";
import * as cheerio from "cheerio";
import fs from "fs";

const BASE_URL = "https://www.leeford.in";
const BATCH_SIZE = 20;

async function getProductLinks() {
  const { data } = await axios.get(
    `${BASE_URL}/category/medicines`,
    {
      timeout: 15000,
      headers: {
        "User-Agent": "Mozilla/5.0"
      }
    }
  );

  const $ = cheerio.load(data);

  const links = new Set();

  $("a").each((_, el) => {
    const href = $(el).attr("href");

    if (href && href.includes("/product/")) {
      links.add(
        href.startsWith("http")
          ? href
          : BASE_URL + href
      );
    }
  });

  return [...links];
}

async function scrapeProduct(url) {
  try {
    const { data } = await axios.get(url, {
      timeout: 15000,
      maxRedirects: 5,
      headers: {
        "User-Agent": "Mozilla/5.0"
      }
    });

    const $ = cheerio.load(data);

    const name =
      $("h1").first().text().trim() ||
      $(".product-title").first().text().trim() ||
      $("title").text().trim();

    if (!name) return null;

    const description =
      $(".product-description").text().trim() ||
      $("meta[name='description']").attr("content") ||
      "";

    const image =
      $("img").first().attr("src") ||
      $("img").first().attr("data-src") ||
      "";

    const composition =
      $("body")
        .text()
        .match(/Composition[:\s]+(.+)/i)?.[1]
        ?.trim() || "";

    return {
      id: Date.now() + Math.random(),
      name,
      description,
      composition,
      category: "Medicines",
      stock: "In Stock",
      prescription: false,
      price: null,
      image: image.startsWith("http")
        ? image
        : image
        ? BASE_URL + image
        : "",
      source: url
    };
  } catch (err) {
    console.log(`❌ Failed: ${url}`);
    return null;
  }
}

async function run() {
  console.log("Fetching products...");

  const links = await getProductLinks();

  console.log(`Found ${links.length} products`);

  const medicines = [];

  for (
    let i = 0;
    i < links.length;
    i += BATCH_SIZE
  ) {
    const batch = links.slice(
      i,
      i + BATCH_SIZE
    );

    const results =
      await Promise.allSettled(
        batch.map(scrapeProduct)
      );

    results.forEach((result) => {
      if (
        result.status === "fulfilled" &&
        result.value
      ) {
        medicines.push(result.value);
      }
    });

    console.log(
      `Processed ${Math.min(
        i + BATCH_SIZE,
        links.length
      )}/${links.length}`
    );
  }

  fs.mkdirSync("./public/data", {
    recursive: true
  });

  fs.writeFileSync(
    "./public/data/medicines.json",
    JSON.stringify(
      medicines,
      null,
      2
    )
  );

  console.log(
    `✅ Saved ${medicines.length} medicines`
  );
}

run();
