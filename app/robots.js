export default function robots() {
  return {
    rules: [
      {
        userAgent: "*",

        allow: "/",

        disallow: [
          "/admin/",
          "/api/",
          "/checkout/"
        ]
      }
    ],

    sitemap:
      "https://dhiman-medicos-online.vercel.app/sitemap.xml"
  };
}
