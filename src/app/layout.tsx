import type { Metadata } from "next";
import { Caveat, Geist, Geist_Mono } from "next/font/google";
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

const noteHand = Caveat({
  variable: "--font-note",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Return Checks",
  description: "Gestión de cheques retornados",
  manifest: "/manifest.json",
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
    <html lang="es" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${noteHand.variable} antialiased`}
      >
        <ThemeProvider>
          {children}
          <UpdateNotifier />
        </ThemeProvider>
      </body>
    </html>
  );
}
