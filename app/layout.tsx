import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Jal-Krishi AI | जल-कृषी",
  description:
    "Deterministic water-balance crop suitability and standing-crop protection advisor for drought-prone Maharashtra.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="mr">
      <body className="min-h-screen bg-soil-50 text-soil-900 font-sans">
        {children}
      </body>
    </html>
  );
}
