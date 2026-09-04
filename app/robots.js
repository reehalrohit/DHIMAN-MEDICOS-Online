export default function robots() {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: "https://dhiman-medicos.vercel.app/sitemap.xml",
  };
}
