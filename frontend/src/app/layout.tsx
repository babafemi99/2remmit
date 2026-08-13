import type { Metadata } from "next";
import "@fontsource-variable/manrope/wght.css";
import { AppToaster } from "@/components/app-toaster";
import "./globals.css";

export const metadata: Metadata = {
  title: "2Remit",
  description: "2Remit payout and remittance application",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    shortcut: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
        <AppToaster />
      </body>
    </html>
  );
}
