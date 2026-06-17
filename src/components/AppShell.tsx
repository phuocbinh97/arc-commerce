"use client";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import AIWidget from "@/components/AIWidget";
import StatusBar from "@/components/StatusBar";
import { SidebarProvider, useSidebar } from "@/components/SidebarContext";

const STANDALONE = ["/checkout", "/shop"];

function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { open, close } = useSidebar();
  const standalone = STANDALONE.some(p => pathname.startsWith(p));

  if (standalone) return <>{children}</>;

  return (
    <>
      {/* Mobile overlay backdrop */}
      {open && (
        <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={close} />
      )}

      <Sidebar />

      <div className="lg:ml-[220px] min-h-screen flex flex-col pb-9">
        {children}
      </div>

      <AIWidget />
      <StatusBar />
    </>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <Shell>{children}</Shell>
    </SidebarProvider>
  );
}
