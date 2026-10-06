import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Callboard",
  description: "Who to call today, and where every job is at.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f6f4ef" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
