import type { Metadata } from "next";
import { headers } from "next/headers";

import "./globals.css";

const description =
  "A cinematic movie-booking demo backed by PostgreSQL transactions, row locks, expiring seat holds, idempotent commands, and atomic payment state.";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:4173";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = new URL(`${protocol}://${host}`);
  const image = new URL("/og.png", origin).toString();

  return {
    metadataBase: origin,
    title: {
      default: "CineLoop — concurrency-safe movie booking",
      template: "%s · CineLoop",
    },
    description,
    applicationName: "CineLoop",
    keywords: ["movie booking", "system design", "PostgreSQL", "concurrency", "portfolio"],
    openGraph: {
      type: "website",
      title: "CineLoop — Big stories. Zero booking drama.",
      description,
      images: [{ url: image, width: 1729, height: 910, alt: "CineLoop movie booking system" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "CineLoop — Big stories. Zero booking drama.",
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
