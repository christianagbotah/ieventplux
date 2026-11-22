import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";
import { ConfirmDialogProvider } from "@/components/ui/confirm-dialog-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "iEventPlux — Discover Events, Join Online & Connect",
  description:
    "Discover public events worldwide, follow organizers, register for free gatherings and explore online or in-person experiences. Paid ticket checkout is available where supported.",
  keywords: ["iEventPlux", "discover events", "online events", "event tickets", "live events", "concerts", "conferences", "communities", "Ghana"],
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
    title: "iEventPlux — Discover Events, Join Online & Connect",
    description:
      "Concerts, conferences, worship, workshops and communities. Discover real events, join free gatherings and follow organizers worldwide.",
    locale: "en_GB",
  },
  twitter: {
    card: "summary_large_image",
    title: "iEventPlux — Discover Events, Join Online & Connect",
    description: "Explore events worldwide, discover online experiences and register for gatherings that matter to you.",
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
        <ThemeProvider><ConfirmDialogProvider>{children}</ConfirmDialogProvider></ThemeProvider>
        <Toaster />
      </body>
    </html>
  );
}
