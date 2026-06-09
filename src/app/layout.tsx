import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import AIWidget from "@/components/AIWidget";

export const metadata: Metadata = {
  title: "Arc Commerce",
  description: "USDC Payment Platform on Arc Testnet",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-bg text-ink font-sans antialiased">
        <Sidebar />
        <div className="ml-[220px] min-h-screen flex flex-col">
          {children}
        </div>
        <AIWidget />
      </body>
    </html>
  );
}
