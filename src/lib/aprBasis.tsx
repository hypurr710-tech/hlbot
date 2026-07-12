"use client";
import { createContext, useContext, useEffect, useState } from "react";
import type { AprBasis } from "@/lib/arb";

const KEY = "hlbot_apr_basis";

const Ctx = createContext<{ basis: AprBasis; setBasis: (b: AprBasis) => void }>({
  basis: "full",
  setBasis: () => {},
});

export function AprBasisProvider({ children }: { children: React.ReactNode }) {
  const [basis, setBasisState] = useState<AprBasis>("full");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw === "hl" || raw === "full") setBasisState(raw);
    } catch {
      /* ignore */
    }
  }, []);

  const setBasis = (b: AprBasis) => {
    setBasisState(b);
    try {
      localStorage.setItem(KEY, b);
    } catch {
      /* ignore */
    }
  };

  return <Ctx.Provider value={{ basis, setBasis }}>{children}</Ctx.Provider>;
}

export function useAprBasis() {
  return useContext(Ctx);
}

/** Human labels for the two bases. */
export const APR_BASIS_LABEL: Record<AprBasis, string> = {
  full: "전체자본",
  hl: "HL 자본만",
};
