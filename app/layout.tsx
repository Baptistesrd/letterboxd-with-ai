import { Metadata } from "next";
import { Analytics } from "@vercel/analytics/react";
import React, { Suspense } from "react";
import "./globals.css";
import "./reset.css";

export const metadata: Metadata = {
  title: "Filmmaxxxing • Social film discovery",
  description: "Built from the Letterboxd clone by JanaIsCoding",
  viewport: "width=device-width, initial-scale=1",
  themeColor: "#000000",
  icons: {
    icon: "/favicon.ico", // Chemin corrigé ici
  },
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
