const SITE_URL = "https://dhiman-medicos-online.vercel.app";

export default function sitemap() {
  const pages = [
    {
      path: "",
      priority: 1.0,
      changeFrequency: "daily"
    },

    {
      path: "/privacy",
      priority: 0.3,
      changeFrequency: "monthly"
    },

    {
      path: "/terms",
      priority: 0.3,
      changeFrequency: "monthly"
    },

    {
      path: "/delivery-policy",
      priority: 0.5,
      changeFrequency: "monthly"
    }
  ];

  return pages.map((page) => ({
    url: SITE_URL + page.path,
    lastModified: new Date(),
    changeFrequency: page.changeFrequency,
    priority: page.priority
  }));
}
