/**
 * MoodFit — Production Ready Next.js Layout
 * next-frontend/app/layout.tsx
 */

import type { Metadata } from "next";
import { Inter, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
});

const jbMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "MoodFit — Poetry-to-Outfit Retrieval Engine",
  description: "A fine-tuned multi-modal semantic retrieval index mapping poems and mood statements to exact wardrobe outfits.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark scroll-smooth">
      <body className={`${inter.variable} ${spaceGrotesk.variable} ${jbMono.variable} font-sans antialiased text-gray-100 bg-[#001424] min-h-screen`}>
        {children}
      </body>
    </html>
  );
}
