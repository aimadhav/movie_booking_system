import type { Metadata } from "next";
import { headers } from "next/headers";

import "./globals.css";
import "./payment-lab.css";

const description =
  "For the love of the big screen. Discover your next film, find a theater, and reserve your perfect seats with CineLoop.";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "localhost:4173";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  const origin = new URL(`${protocol}://${host}`);
  const image = new URL("/images/last-orbit.webp", origin).toString();

  return {
    metadataBase: origin,
    title: {
      default: "CineLoop — For the love of the big screen",
      template: "%s · CineLoop",
    },
    description,
    applicationName: "CineLoop",
    keywords: [
      "movie booking",
      "system design",
      "PostgreSQL",
      "concurrency",
      "portfolio",
    ],
    openGraph: {
      type: "website",
      title: "CineLoop — For the love of the big screen",
      description,
      images: [
        {
          url: image,
          width: 1672,
          height: 941,
          alt: "The Last Orbit, an original CineLoop featured film",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "CineLoop — For the love of the big screen",
      description,
      images: [image],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
