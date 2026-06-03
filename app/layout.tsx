import type { Metadata } from "next";
import { FluidBackground } from "./fluid-background";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI 工作流记忆",
  description: "本地 AI 工作流记忆与每日复盘工作台",
  icons: {
    icon: "/favicon.svg"
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>
        <FluidBackground />
        {children}
      </body>
    </html>
  );
}
