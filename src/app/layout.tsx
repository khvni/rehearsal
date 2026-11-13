import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { FluidProvider } from "@/lib/fluid-provider";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], axes: ["opsz"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Rehearsal",
  description: "Rehearse your website before users do.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <FluidProvider>{children}</FluidProvider>
      </body>
    </html>
  );
}
