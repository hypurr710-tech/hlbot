"use client";
import { useCallback, useEffect, useState } from "react";
import {
  loadArbPairs,
  addArbPair as add,
  updateArbPair as update,
  removeArbPair as remove,
  closeArbPair as close,
  type ArbPair,
} from "@/lib/arbStore";

export function useArbPairs() {
  const [pairs, setPairs] = useState<ArbPair[]>([]);

  useEffect(() => { setPairs(loadArbPairs()); }, []);

  const addPair = useCallback((input: Omit<ArbPair, "id" | "createdAt">) => {
    add(input);
    setPairs(loadArbPairs());
  }, []);

  const updatePair = useCallback((id: string, patch: Partial<ArbPair>) => {
    update(id, patch);
    setPairs(loadArbPairs());
  }, []);

  const removePair = useCallback((id: string) => {
    remove(id);
    setPairs(loadArbPairs());
  }, []);

  const closePair = useCallback((id: string) => {
    close(id);
    setPairs(loadArbPairs());
  }, []);

  return { pairs, addPair, updatePair, removePair, closePair };
}
