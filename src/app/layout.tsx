import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { FluidProvider } from "@/lib/fluid-provider";
import { PostHogInit } from "@/components/posthog-init";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], axes: ["opsz"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Rehearsal",
  description: "Find usability problems on your website, review the evidence, and try a wireframe based on the suggested fixes.",
  // Reuse alikhani.co's icons until Rehearsal has its own.
  icons: {
    icon: [
      { url: "/favicon-32x32.png", type: "image/png", sizes: "32x32" },
      { url: "/favicon-16x16.png", type: "image/png", sizes: "16x16" },
    ],
    apple: { url: "/apple-touch-icon.png", sizes: "180x180" },
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <FluidProvider>{children}</FluidProvider>
        <PostHogInit />
      </body>
    </html>
  );
}
