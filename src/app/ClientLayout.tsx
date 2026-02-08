"use client";

import { useState, useEffect } from "react";
import Sidebar from "@/components/Sidebar";
import {
  AddressContext,
  TrackedAddress,
  getStoredAddresses,
} from "@/lib/store";

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [addresses, setAddresses] = useState<TrackedAddress[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    setAddresses(getStoredAddresses());
  }, []);

  return (
    <AddressContext.Provider value={{ addresses, setAddresses }}>
      <div className="flex min-h-screen">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        {/* Mobile header with hamburger */}
        <div className="fixed top-0 left-0 right-0 h-14 bg-hl-bg-secondary border-b border-hl-border flex items-center px-4 z-40 md:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 text-hl-text-secondary hover:text-hl-text-primary transition-colors"
            aria-label="Open menu"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
            </svg>
          </button>
          <span className="ml-2 text-sm font-bold gradient-text">Hypurr Tracker</span>
        </div>
        <main className="flex-1 md:ml-[220px] mt-14 md:mt-0">
          <div className="p-4 md:p-8 max-w-[1400px] mx-auto">{children}</div>
        </main>
      </div>
    </AddressContext.Provider>
  );
}
