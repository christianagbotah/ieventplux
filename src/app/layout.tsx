import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "iEventPlux — Discover, Ticket & Broadcast Events in Ghana",
  description:
    "iEventPlux by Lightworld Technologies: events discovery, ticketing, social feeds and live broadcasting for churches, ministries and organizations in Ghana. Prices in Ghana cedis.",
  keywords: ["iEventPlux", "events", "Ghana", "Accra", "tickets", "live streaming", "church events", "conferences"],
  applicationName: "iEventPlux",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "iEventPlux",
    statusBarStyle: "default",
  },
  openGraph: {
    type: "website",
    siteName: "iEventPlux",
    title: "iEventPlux — Discover, Ticket & Broadcast Events in Ghana",
    description:
      "Church services, concerts, conferences, workshops and community moments — secure mobile-money checkout, QR tickets and protected live broadcasts.",
    locale: "en_GH",
  },
  twitter: {
    card: "summary_large_image",
    title: "iEventPlux — Discover, Ticket & Broadcast Events in Ghana",
    description: "Events discovery, ticketing and live broadcasting for Ghana. Prices in Ghana cedis.",
  },
  icons: {
    icon: "/logo.svg",
    apple: "/logo.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#059669",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
