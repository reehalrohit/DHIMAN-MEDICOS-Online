import "./styles.css";
import { Analytics } from "@vercel/analytics/react";
import "./styles/thermal.css";

export const metadata = {
  title: "Dhiman Medicos – Medical Store in Binewal, Hoshiarpur | 1000+ Medicines",
  description:
    "Dhiman Medicos, Binewal — your trusted medical store in Hoshiarpur, Punjab. Browse 1000+ medicines across 21 categories. Order instantly on WhatsApp. Pain relief, diabetes, BP, antibiotics, vitamins and more.",
  keywords:
    "Dhiman Medicos, medical store Binewal, pharmacy Hoshiarpur, medicine shop Punjab, dawa shop Binewal, WhatsApp medicine order, online pharmacy Hoshiarpur, medicine home delivery Punjab, best medical store near Binewal",
  authors:     [{ name: "Dhiman Medicos" }],
  creator:     "Dhiman Medicos",
  metadataBase: new URL("https://dhiman-medicos.vercel.app"),
  alternates:  { canonical: "https://dhiman-medicos.vercel.app" },
  openGraph: {
    title:       "Dhiman Medicos – Medical Store in Binewal, Hoshiarpur",
    description: "1000+ medicines. Order on WhatsApp instantly. Binewal, Hoshiarpur, Punjab.",
    url:         "https://dhiman-medicos.vercel.app",
    siteName:    "Dhiman Medicos",
    type:        "website",
    locale:      "en_IN",
  },
  twitter: {
    card:        "summary",
    title:       "Dhiman Medicos – Medical Store Binewal",
    description: "1000+ medicines. Order on WhatsApp. Binewal, Hoshiarpur, Punjab.",
  },
  robots: {
    index: true, follow: true,
    googleBot: { index: true, follow: true },
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        {/* PWA */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#065f46" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Dhiman Medicos" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />

        {/* Local SEO */}
        <meta name="geo.region"    content="IN-PB" />
        <meta name="geo.placename" content="Binewal, Hoshiarpur" />
        <meta name="geo.position"  content="31.5200;75.9300" />
        <meta name="ICBM"          content="31.5200, 75.9300" />

        {/* Preconnect for Google Fonts */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />

        {/* Schema.org — Pharmacy structured data */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Pharmacy",
              name:        "Dhiman Medicos",
              description: "Trusted medical store in Binewal, Hoshiarpur offering 1000+ medicines with instant WhatsApp ordering.",
              url:         "https://dhiman-medicos.vercel.app",
              telephone:   "+919478509980",
              priceRange:  "₹",
              address: {
                "@type":           "PostalAddress",
                streetAddress:     "Binewal",
                addressLocality:   "Hoshiarpur",
                addressRegion:     "Punjab",
                postalCode:        "144523",
                addressCountry:    "IN",
              },
              geo: {
                "@type":     "GeoCoordinates",
                latitude:    31.52,
                longitude:   75.93,
              },
              openingHoursSpecification: {
                "@type":    "OpeningHoursSpecification",
                dayOfWeek:  ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"],
                opens:      "08:00",
                closes:     "21:00",
              },
              contactPoint: {
                "@type":           "ContactPoint",
                telephone:         "+919478509980",
                contactType:       "customer service",
                availableLanguage: ["English", "Hindi", "Punjabi"],
              },
              sameAs: ["https://wa.me/919478509980"],
            }),
          }}
        />
      </head>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
    }
