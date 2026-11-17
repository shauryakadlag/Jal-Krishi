import type { Metadata } from "next";
import "./globals.css";

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
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
