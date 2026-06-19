import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppShell } from "./components/AppShell";

export const metadata: Metadata = {
  title: "Fanben Reader",
  description: "把你喜欢的文章加工成双语精读流水线",
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F5F2E8" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className="h-full antialiased"
    >
      <head>
        <link
          rel="preconnect"
          href="https://fonts.googleapis.com"
          crossOrigin="anonymous"
        />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700&text=导库词导入文章生词本FR&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full bg-[#F5F2E8] text-zinc-900">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
