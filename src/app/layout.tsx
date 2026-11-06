import type { Metadata } from "next";
import { Geist, Geist_Mono, Kalam } from "next/font/google";
import "./globals.css";
import ThemeProvider from "@/components/ThemeProvider";
import UpdateNotifier from "@/components/UpdateNotifier";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const hand = Kalam({
  variable: "--font-hand",
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: "Return Checks",
  description: "Gestión de cheques retornados",
  manifest: "/manifest.json",
  other: { google: "notranslate" },
  appleWebApp: {
    capable: true,
    title: "Return Checks",
    statusBarStyle: "black-translucent",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" translate="no" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${hand.variable} antialiased`}
      >
        <ThemeProvider>
          {children}
          <UpdateNotifier />
        </ThemeProvider>
      </body>
    </html>
  );
}
