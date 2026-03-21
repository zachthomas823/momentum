import type { Metadata } from "next";
import { Outfit, DM_Sans } from "next/font/google";
import RegisterSW from "@/components/RegisterSW";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800", "900"],
  display: "swap",
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

import type { Viewport } from "next";

export const metadata: Metadata = {
  title: "Decision-Impact Fitness Tracker",
  description:
    "Track how lifestyle decisions cascade into body composition changes",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${outfit.variable} ${dmSans.variable} h-full antialiased`}
      style={{ background: "var(--bg)" }}
    >
      <body className="min-h-full flex flex-col items-center bg-bg text-t1">
        <div className="w-full max-w-[430px] min-h-full flex flex-col">
          {children}
        </div>
        <RegisterSW />
      </body>
    </html>
  );
}
