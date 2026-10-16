import type { Metadata, Viewport } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { ShopProvider } from "@/components/shop/ShopProvider";
import { MetaPixel } from "@/components/analytics/MetaPixel";
import { CookieConsent } from "@/components/analytics/CookieConsent";
import { JsonLd } from "@/components/seo/JsonLd";
import { organizationSchema, websiteSchema } from "@/lib/schema";
import { siteConfig } from "@/data/site";
import { buildMetadata } from "@/lib/seo";
import "./globals.css";

const inter = Inter({
  variable: "--font-body",
  subsets: ["latin"],
  display: "swap",
});

const playfair = Playfair_Display({
  variable: "--font-heading",
  subsets: ["latin"],
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#ffffff",
};

export const metadata: Metadata = {
  ...buildMetadata({
    title: "Premium Oversized T-Shirts | Plain Thread",
    description: siteConfig.description,
    path: "/",
  }),
  metadataBase: new URL(siteConfig.domain),
  applicationName: siteConfig.name,
  keywords: [
    "Plain Thread T-shirt",
    "Plain Thread oversized t-shirt",
    "Best oversized t-shirt India",
    "220 GSM oversized t-shirt",
    "Combed cotton oversized t-shirt",
    "Minimal oversized t-shirt",
    "Black oversized t-shirt men",
    "White oversized t-shirt women",
    "Healthy cotton t-shirt",
    "Skin friendly oversized t-shirt",
  ],
  authors: [{ name: siteConfig.name, url: siteConfig.domain }],
  creator: siteConfig.name,
  icons: {
    icon: "/logo.svg",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${playfair.variable} h-full`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col font-sans antialiased">
        <MetaPixel />
        <JsonLd data={[organizationSchema(), websiteSchema()]} />
        <ShopProvider>
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
          <CookieConsent />
        </ShopProvider>
      </body>
    </html>
  );
}
