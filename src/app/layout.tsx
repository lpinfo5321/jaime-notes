import type { Metadata } from "next";
import { Inter, Geist, Geist_Mono, Manrope, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import "./skins.css";
import ThemeProvider from "@/components/ThemeProvider";
import UpdateNotifier from "@/components/UpdateNotifier";
import SkinSwitcher from "@/components/SkinSwitcher";

// Inter: tipografía moderna y muy legible, con números tabulares (ideal para montos).
const geistSans = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Tipografías extra para los estilos alternativos (cada estilo usa la suya).
const fontGeist = Geist({ variable: "--font-skin-geist", subsets: ["latin"], display: "swap" });
const fontManrope = Manrope({ variable: "--font-skin-manrope", subsets: ["latin"], display: "swap" });
const fontJakarta = Plus_Jakarta_Sans({ variable: "--font-skin-jakarta", subsets: ["latin"], display: "swap" });

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
        className={`${geistSans.variable} ${geistMono.variable} ${fontGeist.variable} ${fontManrope.variable} ${fontJakarta.variable} antialiased`}
      >
        <ThemeProvider>
          {children}
          <UpdateNotifier />
          {/* Solo aparece en modo local (npm run dev); nunca en producción */}
          <SkinSwitcher />
        </ThemeProvider>
      </body>
    </html>
  );
}
