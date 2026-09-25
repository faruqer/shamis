import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { PwaRegister } from "@/components/pwa-register";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Stock & Money | Inventory Management",
  description: "Professional stock and money management system for imports, wholesale, and retail",
  applicationName: "Stock & Money",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Stock & Money",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icons/icon-192x192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#2f7d62",
  width: "device-width",
  initialScale: 1,
  // Let the app paint under the notch/home indicator; safe-area insets are
  // applied by the mobile header, drawer and page padding.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} antialiased`}>
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
