"use client";
import type { LiveSnapshot } from "@/lib/aggregator/types";
import ScannerTable from "./ScannerTable";

interface Props { snapshot: LiveSnapshot | null }

export default function ScannerPanel({ snapshot }: Props) {
  if (!snapshot) {
    return (
      <div className="bg-hl-bg-secondary border border-hl-border rounded-xl p-6 text-sm text-hl-text-tertiary">
        Loading…
      </div>
    );
  }
  return <ScannerTable snapshot={snapshot} />;
}
