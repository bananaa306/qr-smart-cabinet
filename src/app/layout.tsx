import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Smart Cabinet",
  description: "Scan · unlock · take · tracked. QR-controlled cabinet access.",
};

export const viewport: Viewport = {
  themeColor: "#0f9488",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
          {children}
        </div>
      </body>
    </html>
  );
}
