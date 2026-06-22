import type { Metadata } from "next";
import { Cinzel, Inter } from "next/font/google";
import "./globals.css";
import { TRPCProvider } from "@/components/providers/trpc-provider";

/**
 * Trails-in-the-Sky / Final Fantasy X type stack.
 *
 *   - Cinzel : headings & menu labels  (Roman-square, formal-fantasy feel)
 *   - Inter  : body copy + numerics    (extremely readable sans-serif)
 *
 * The earlier "Press Start 2P pixel chips + IM Fell English body" stack
 * went too retro-arcade — Trails/FFX menus use clean, high-contrast
 * sans-serif body text with serif accents on labels and stat lines. This
 * combo matches that without sacrificing readability at small sizes.
 */
const cinzel = Cinzel({
  variable: "--font-cinzel",
  subsets: ["latin"],
  weight: ["500", "700", "900"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Questline",
  description: "A gamified life-management application.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${cinzel.variable} ${inter.variable} dark h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-trails-bg text-trails-fg">
        <TRPCProvider>{children}</TRPCProvider>
      </body>
    </html>
  );
}
