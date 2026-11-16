import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { SessionProvider } from "@/components/session-provider";
import { ServiceWorker } from "@/components/pwa";
import { withBase } from "@/lib/base-path";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Family Planner", template: "%s · Family Planner" },
  description: "Calendar, chores, shopping lists and meal plans for the whole family.",
  applicationName: "Family Planner",
  manifest: withBase("/manifest.webmanifest"),
  icons: {
    icon: [
      { url: withBase("/icons/icon-192.png"), sizes: "192x192", type: "image/png" },
      { url: withBase("/icons/icon.svg"), type: "image/svg+xml" },
    ],
    apple: [{ url: withBase("/icons/apple-touch-icon.png"), sizes: "180x180" }],
  },
  appleWebApp: { capable: true, title: "Planner", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#4f46e5" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
        <SessionProvider>{children}</SessionProvider>
        <ServiceWorker />
      </body>
    </html>
  );
}
