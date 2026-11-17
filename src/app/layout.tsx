import type { Metadata, Viewport } from "next";
import { SessionProvider } from "@/components/session-provider";
import { NoZoom, ServiceWorker } from "@/components/pwa";
import { withBase } from "@/lib/base-path";
import "./globals.css";

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
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-white text-ink">
        <SessionProvider>{children}</SessionProvider>
        <ServiceWorker />
        <NoZoom />
      </body>
    </html>
  );
}
