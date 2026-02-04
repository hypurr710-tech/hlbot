"use client";

import { useAddresses } from "@/lib/store";
import { addAddress, removeAddress, saveAddresses } from "@/lib/store";
import AddressInput from "@/components/AddressInput";
import { formatAddress } from "@/lib/format";

export default function AddressPage() {
  const { addresses, setAddresses } = useAddresses();

  const handleAdd = (address: string, label: string) => {
    const updated = addAddress(address, label);
    setAddresses(updated);
  };

  const handleRemove = (address: string) => {
    const updated = removeAddress(address);
    setAddresses(updated);
  };

  const handleLabelChange = (address: string, newLabel: string) => {
    const updated = addresses.map((a) =>
      a.address.toLowerCase() === address.toLowerCase()
        ? { ...a, label: newLabel }
        : a
    );
    saveAddresses(updated);
    setAddresses(updated);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-semibold text-hl-text-primary">
          Manage Addresses
        </h1>
        <p className="text-sm text-hl-text-secondary mt-1">
          Add and manage your Hyperliquid wallet addresses for tracking
        </p>
      </div>

      {/* Add Address Form */}
      <div className="bg-hl-bg-secondary border border-hl-border rounded-xl p-5">
        <h2 className="text-sm font-medium text-hl-text-primary mb-4">
          Add New Address
        </h2>
        <AddressInput onAdd={handleAdd} />
      </div>

      {/* Address List */}
      <div className="bg-hl-bg-secondary border border-hl-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-hl-border">
          <h2 className="text-sm font-medium text-hl-text-primary">
            Tracked Addresses ({addresses.length})
          </h2>
        </div>

        {addresses.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <p className="text-sm text-hl-text-tertiary">
              No addresses tracked yet. Add a wallet address above to get
              started.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-hl-border/50">
            {addresses.map((addr) => (
              <div
                key={addr.address}
                className="flex items-center justify-between px-5 py-4 hover:bg-hl-bg-hover/50 transition-colors"
              >
                <div className="flex items-center gap-4 flex-1">
                  <div className="w-10 h-10 rounded-lg bg-hl-bg-tertiary border border-hl-border flex items-center justify-center">
                    <svg
                      className="w-5 h-5 text-hl-accent"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3"
                      />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <input
                      type="text"
                      value={addr.label}
                      onChange={(e) =>
                        handleLabelChange(addr.address, e.target.value)
                      }
                      className="bg-transparent text-sm font-medium text-hl-text-primary focus:outline-none border-b border-transparent focus:border-hl-accent/30 transition-colors"
                    />
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs font-mono text-hl-text-tertiary">
                        {formatAddress(addr.address)}
                      </span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(addr.address);
                        }}
                        className="text-hl-text-tertiary hover:text-hl-text-secondary transition-colors"
                        title="Copy address"
                      >
                        <svg
                          className="w-3.5 h-3.5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={1.5}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184"
                          />
                        </svg>
                      </button>
                      <a
                        href={`https://app.hyperliquid.xyz/explorer/address/${addr.address}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-hl-text-tertiary hover:text-hl-accent transition-colors"
                        title="View on Hyperliquid"
                      >
                        <svg
                          className="w-3.5 h-3.5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={1.5}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
                          />
                        </svg>
                      </a>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => handleRemove(addr.address)}
                  className="p-2 rounded-lg text-hl-text-tertiary hover:text-hl-red hover:bg-hl-red/10 transition-colors"
                  title="Remove address"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                    />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
