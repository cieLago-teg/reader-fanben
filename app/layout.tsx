import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "./components/AppShell";

export const metadata: Metadata = {
  title: "Fanben Reader",
  description: "把你喜欢的文章加工成双语精读流水线",
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
      <body className="min-h-full bg-[#F5F2E8] text-zinc-900">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
