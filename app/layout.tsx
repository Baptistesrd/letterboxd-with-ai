import { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/react";
import React, { Suspense } from "react";
import "./globals.css";
import "./reset.css";

export const metadata: Metadata = {
  title: "Filmmaxxxing • Social film discovery",
  description: "Built from the Letterboxd clone by JanaIsCoding",
  icons: {
    icon: "/favicon.ico",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#000000",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div id="root">
          <Suspense>{children}</Suspense>
        </div>
        <Analytics />
      </body>
    </html>
  );
}
