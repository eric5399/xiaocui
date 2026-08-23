import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "小萃 · 机构经验萃取平台",
    template: "%s · 小萃",
  },
  description: "将一线业务人员的隐性经验沉淀为可追溯的案例、经验规则与 Skill Reference。",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#193b55",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
