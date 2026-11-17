import type { Metadata } from "next";
import { Inter, Noto_Sans_Devanagari } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

const notoSansDevanagari = Noto_Sans_Devanagari({
  subsets: ["devanagari"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-devanagari",
});

export const metadata: Metadata = {
  title: "Jal-Krishi AI | जल-कृषी",
  description:
    "Climate-intelligence water-balance crop suitability and standing-crop protection advisor for Maharashtra.",
};

const themeInitScript = `
(function() {
  try {
    var t = localStorage.getItem('jal_krishi_theme');
    if (t === 'dark') document.documentElement.classList.add('dark');
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="mr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className={`${inter.variable} ${notoSansDevanagari.variable} min-h-screen font-sans overflow-x-hidden relative`}>
        {/* Full-Website Crystal-Clear Flowing Water Background with Visible Continuous Wave Motion */}
        <div className="water-world-bg" aria-hidden="true">
          <div className="water-caustics-layer" />
          <div className="water-flow-waves">
            <div className="water-wave water-wave-1" />
            <div className="water-wave water-wave-2" />
            <div className="water-wave water-wave-3" />
          </div>
          <div className="water-ripples-layer" />
        </div>
        {children}
      </body>
    </html>
  );
}
