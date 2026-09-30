import type { Metadata } from "next";
import { Geist_Mono, Fraunces, Manrope } from "next/font/google";
import ThemeInitScript from "@/components/theme-init-script";
import ThemeToggle from "@/components/theme-toggle";
import FloatingMascot from "@/components/floating-mascot";
import "./globals.css";

// A pairing built for the glass UI rather than a straight vintage-serif
// look: Manrope is a clean geometric sans that reads sharply through
// frosted/translucent surfaces at small sizes, where a full serif body
// gets muddy. Fraunces carries the personality on headings only — it has
// enough warmth to feel considered without fighting the glass panels for
// attention.
const bodyFont = Manrope({
  variable: "--font-body",
  subsets: ["latin"],
});

const headingFont = Fraunces({
  variable: "--font-heading",
  weight: ["500", "600", "700"],
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AutoBot - Customer Automation, Simplified",
  description: "Customer follow-up automation",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${bodyFont.variable} ${headingFont.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <ThemeInitScript />
      </head>
      <body className="min-h-full flex flex-col">
        {children}
        <ThemeToggle />
        <FloatingMascot />
      </body>
    </html>
  );
}
