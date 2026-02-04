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

  useEffect(() => {
    setAddresses(getStoredAddresses());
  }, []);

  return (
    <AddressContext.Provider value={{ addresses, setAddresses }}>
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 ml-[220px]">
          <div className="p-8 max-w-[1400px] mx-auto">{children}</div>
        </main>
      </div>
    </AddressContext.Provider>
  );
}
