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
      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
        <div className="flex-1 relative">
          <input
            type="text"
            placeholder="0x... wallet address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="w-full bg-hl-bg-tertiary border border-hl-border rounded-lg px-4 py-2.5 pr-10 text-sm text-hl-text-primary placeholder:text-hl-text-tertiary focus:outline-none focus:border-hl-accent/50 transition-colors font-mono"
          />
          <button
            type="button"
            onClick={async () => {
              try {
                const text = await navigator.clipboard.readText();
                setAddress(text.trim());
              } catch { /* clipboard access denied */ }
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-hl-text-tertiary hover:text-hl-accent transition-colors"
            title="Paste from clipboard"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
            </svg>
          </button>
        </div>
        <div className="sm:w-48">
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
