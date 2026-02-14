import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PostPilot - SNS Auto Post",
  description: "X + Threads simultaneous posting web app",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className="dark">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
