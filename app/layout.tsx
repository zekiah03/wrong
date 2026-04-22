import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "戯義偽欺着魏",
  description: "答えのない問いに、答える。",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
