import "./styles.css";
import { Analytics } from "@vercel/analytics/react";
import "./styles/thermal.css";

const SITE_URL = "https://dhiman-medicos-online.vercel.app";

export const metadata = {
  title:
    "Dhiman Medicos | Medical Store in Binewal, Hoshiarpur, Punjab",

  description:
    "Dhiman Medicos is a medical store and pharmacy in Binewal, Hoshiarpur, Punjab. Browse medicines, check prices and place online orders.",

  keywords: [
    "Dhiman Medicos",
    "medical store Binewal",
    "pharmacy Binewal",
    "medical store Hoshiarpur",
    "pharmacy Hoshiarpur",
    "medicine shop Punjab",
    "online medicine order Binewal",
    "medicine store near Binewal",
    "chemist Binewal",
    "chemist Hoshiarpur"
  ],

  authors: [
    {
      name: "Dhiman Medicos"
    }
  ],

  creator: "Dhiman Medicos",

  metadataBase: new URL(SITE_URL),

  alternates: {
    canonical: SITE_URL
  },

  openGraph: {
    title:
      "Dhiman Medicos | Medical Store in Binewal, Hoshiarpur",

    description:
      "Dhiman Medicos — medical store and pharmacy in Binewal, Hoshiarpur, Punjab.",

    url: SITE_URL,

    siteName: "Dhiman Medicos",

    type: "website",

    locale: "en_IN"
  },

  twitter: {
    card: "summary",

    title:
      "Dhiman Medicos | Medical Store Binewal",

    description:
      "Medical store and pharmacy in Binewal, Hoshiarpur, Punjab."
  },

  robots: {
    index: true,
    follow: true,

    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1
    }
  }
};

export default function RootLayout({ children }) {
  return (
    <html lang="en-IN">
      <head>
        {/* PWA */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#065f46" />
        <meta
          name="apple-mobile-web-app-capable"
          content="yes"
        />
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="default"
        />
        <meta
          name="apple-mobile-web-app-title"
          content="Dhiman Medicos"
        />
        <link
          rel="apple-touch-icon"
          href="/apple-touch-icon.png"
        />

        {/* Local SEO */}
        <meta name="geo.region" content="IN-PB" />
        <meta
          name="geo.placename"
          content="Binewal, Hoshiarpur, Punjab, India"
        />

        {/* Keep these only if the coordinates are the REAL store location */}
        <meta name="geo.position" content="31.5200;75.9300" />
        <meta name="ICBM" content="31.5200, 75.9300" />

        {/* Preconnect for Google Fonts */}
        <link
          rel="preconnect"
          href="https://fonts.googleapis.com"
        />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />

        {/* Schema.org — Pharmacy structured data */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Pharmacy",
              "@id": `${SITE_URL}#pharmacy`,

              name: "Dhiman Medicos",

              url: SITE_URL,

              description:
                "Dhiman Medicos is a medical store and pharmacy in Binewal, Hoshiarpur, Punjab.",

              telephone: "+919478509980",

              priceRange: "₹",

              address: {
                "@type": "PostalAddress",
                streetAddress: "Binewal",
                addressLocality: "Hoshiarpur",
                addressRegion: "Punjab",
                postalCode: "144523",
                addressCountry: "IN"
              },

              geo: {
                "@type": "GeoCoordinates",
                latitude: 31.52,
                longitude: 75.93
              },

              openingHoursSpecification: {
                "@type": "OpeningHoursSpecification",

                dayOfWeek: [
                  "Monday",
                  "Tuesday",
                  "Wednesday",
                  "Thursday",
                  "Friday",
                  "Saturday",
                  "Sunday"
                ],

                opens: "08:00",
                closes: "21:00"
              },

              contactPoint: {
                "@type": "ContactPoint",

                telephone: "+919478509980",

                contactType: "customer service",

                availableLanguage: [
                  "English",
                  "Hindi",
                  "Punjabi"
                ]
              },

              sameAs: [
                "https://wa.me/919478509980"
              ]
            })
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
