import { Provider } from "@/components/provider";
import { assetPath } from "@/lib/paths";
import { appDescription, appName, appTitle, siteUrl } from "@/lib/shared";
import type { Metadata } from "next";
import localFont from "next/font/local";
import "./global.css";

const inter = localFont({
  src: [
    {
      path: "../assets/fonts/inter-latin-variable-normal.woff2",
      weight: "100 900",
      style: "normal",
    },
  ],
  display: "swap",
});

const parkinsans = localFont({
  src: [{ path: "../assets/fonts/parkinsans-variable.ttf", weight: "300 800", style: "normal" }],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: appTitle,
    template: `%s | ${appName}`,
  },
  description: appDescription,
  applicationName: appName,
  icons: {
    icon: assetPath("/favicon.ico"),
  },
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: appName,
    title: appTitle,
    description: appDescription,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: appTitle,
    description: appDescription,
  },
};

export default function Layout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${inter.className} ${parkinsans.variable}`}
      suppressHydrationWarning
    >
      <body className="flex flex-col min-h-screen">
        <Provider>{children}</Provider>
      </body>
    </html>
  );
}
