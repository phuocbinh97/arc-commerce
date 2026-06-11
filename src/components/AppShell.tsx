"use client";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import AIWidget from "@/components/AIWidget";
import StatusBar from "@/components/StatusBar";

// Pages that should NOT have sidebar (standalone / embeddable)
const STANDALONE = ["/checkout", "/shop"];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const standalone = STANDALONE.some(p => pathname.startsWith(p));

  if (standalone) {
    return <>{children}</>;
  }

  return (
    <>
      <Sidebar />
      <div className="ml-[240px] min-h-screen flex flex-col pb-9">
        {children}
      </div>
      <AIWidget />
      <StatusBar />
    </>
  );
}
