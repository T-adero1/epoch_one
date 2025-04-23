import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ZkLoginProvider } from "@/app/contexts/ZkLoginContext";
import { AppStateProvider } from "@/app/contexts/AppStateContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "EpochOne - Web3 Document Management",
  description: "Secure your business documents with Web3 cryptography and digital verification",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="scroll-smooth">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AppStateProvider>
          <ZkLoginProvider>
            {children}
          </ZkLoginProvider>
        </AppStateProvider>
      </body>
    </html>
  );
}
