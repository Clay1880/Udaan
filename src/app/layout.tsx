import type { Metadata, Viewport } from "next";
import { Chango, Fredoka } from "next/font/google";
import { AuthProvider } from "@/components/auth-provider";
import { SiteFooter } from "@/components/site-footer";
import "./globals.css";

const display = Chango({ subsets: ["latin"], weight: "400", variable: "--font-chango" });
const sans = Fredoka({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-fredoka" });

export const metadata: Metadata = {
  title: "Udaan | Air Force Day by NSS",
  description: "Quiz and poster competitions for Air Force Day, 8-9 October.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#efece4" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <body>
        <AuthProvider>{children}</AuthProvider>
        <SiteFooter />
      </body>
    </html>
  );
}
