import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MeetSL",
  description: "Real-time meeting accessibility bridge",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
