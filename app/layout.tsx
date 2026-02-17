import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
import "./globals.css";


const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Arc | AI Financial Forecaster",
    template: "%s | Arc",
  },
  description: "Predict your financial future with AI-powered forecasting, budgeting, and smart spending insights.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL || "https://arcpredict.com"),
  openGraph: {
    title: "Arc | AI Financial Forecaster",
    description: "Predict your financial future with AI-powered forecasting, budgeting, and smart spending insights.",
    type: "website",
    siteName: "Arc Predict",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Arc — AI Financial Forecaster",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Arc | AI Financial Forecaster",
    description: "Predict your financial future with AI-powered forecasting and budgeting.",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#0a0a0a" media="(prefers-color-scheme: dark)" />
        <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" />
        <link rel="canonical" href={process.env.NEXT_PUBLIC_BASE_URL || "https://arcpredict.com"} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebApplication",
            "name": "Arc Predict",
            "description": "AI-powered financial forecasting and budgeting application",
            "applicationCategory": "FinanceApplication",
            "operatingSystem": "Web",
            "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
          })}}
        />
        <script dangerouslySetInnerHTML={{ __html: `
          (function(){try{var t=localStorage.getItem('arc-theme');
          if(t==='light'||(t==='system'&&!matchMedia('(prefers-color-scheme:dark)').matches)){
            document.documentElement.classList.replace('dark','light');
          }}catch(e){}})();
        `}} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider>
        <ServiceWorkerRegistration />
        {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
