import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import { AppToaster } from "@/components/app-toaster";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "2Remit",
  description: "2Remit payout and remittance application",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={manrope.variable}>
      <body>
        {children}
        <AppToaster />
      </body>
    </html>
  );
}
