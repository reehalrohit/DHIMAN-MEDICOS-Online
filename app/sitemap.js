const SITE_URL = "https://dhiman-medicos-online.vercel.app";

const LAST_MODIFIED = new Date("2026-09-29");

export default function sitemap() {
  const pages = [
    {
      path: "",
      priority: 1.0,
      changeFrequency: "daily",
    },
    {
      path: "/privacy",
      priority: 0.3,
      changeFrequency: "yearly",
    },
    {
      path: "/terms",
      priority: 0.3,
      changeFrequency: "yearly",
    },
    {
      path: "/delivery-policy",
      priority: 0.5,
      changeFrequency: "monthly",
    },
  ];

  return pages.map((page) => ({
    url: `${SITE_URL}${page.path}`,
    lastModified: LAST_MODIFIED,
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }));
}
