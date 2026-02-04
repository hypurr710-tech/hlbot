"use client";

import { useState } from "react";

interface AddressInputProps {
  onAdd: (address: string, label: string) => void;
}

export default function AddressInput({ onAdd }: AddressInputProps) {
  const [address, setAddress] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!address.match(/^0x[a-fA-F0-9]{40}$/)) {
      setError("Invalid Ethereum address format");
      return;
    }

    onAdd(address, label || `Wallet ${address.slice(0, 6)}`);
    setAddress("");
    setLabel("");
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex gap-3">
        <div className="flex-1">
          <input
            type="text"
            placeholder="0x... wallet address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="w-full bg-hl-bg-tertiary border border-hl-border rounded-lg px-4 py-2.5 text-sm text-hl-text-primary placeholder:text-hl-text-tertiary focus:outline-none focus:border-hl-accent/50 transition-colors font-mono"
          />
        </div>
        <div className="w-48">
          <input
            type="text"
            placeholder="Label (optional)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="w-full bg-hl-bg-tertiary border border-hl-border rounded-lg px-4 py-2.5 text-sm text-hl-text-primary placeholder:text-hl-text-tertiary focus:outline-none focus:border-hl-accent/50 transition-colors"
          />
        </div>
        <button
          type="submit"
          className="px-5 py-2.5 bg-hl-accent text-hl-bg-primary rounded-lg text-sm font-semibold hover:bg-hl-accent/90 transition-colors"
        >
          Add Address
        </button>
      </div>
      {error && <p className="text-xs text-hl-red">{error}</p>}
    </form>
  );
}
