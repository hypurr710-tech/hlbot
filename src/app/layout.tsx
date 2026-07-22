import type { Metadata, Viewport } from "next";
import "./globals.css";
import ClientLayout from "./ClientLayout";

export const metadata: Metadata = {
  title: "Hypurr Tracker - Hyperliquid Portfolio Dashboard",
  description:
    "Track your Hyperliquid portfolio performance, trading volume, fees, and PnL",
};

/* 수동 <meta>로 넣으면 Next가 기본 viewport를 하나 더 주입해 maximum-scale이
 * 무시된다(마지막 태그 승) — 반드시 viewport export로 단일 태그를 보장할 것. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0b0e11",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}
