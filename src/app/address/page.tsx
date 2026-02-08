"use client";

import { useState } from "react";
import { useAddresses } from "@/lib/store";
import { addAddress, removeAddress, saveAddresses } from "@/lib/store";
import AddressInput from "@/components/AddressInput";
import { formatAddress } from "@/lib/format";

export default function AddressPage() {
  const { addresses, setAddresses } = useAddresses();
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

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

  const handleDragStart = (index: number) => {
    setDragIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };

  const handleDrop = (index: number) => {
    if (dragIndex === null || dragIndex === index) {
      setDragIndex(null);
      setDragOverIndex(null);
      return;
    }
    const updated = [...addresses];
    const [moved] = updated.splice(dragIndex, 1);
    updated.splice(index, 0, moved);
    saveAddresses(updated);
    setAddresses(updated);
    setDragIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDragIndex(null);
    setDragOverIndex(null);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl md:text-2xl font-semibold text-hl-text-primary">
          Manage Addresses
        </h1>
        <p className="text-xs md:text-sm text-hl-text-secondary mt-1">
          Hyperliquid 지갑 주소를 추가하고 관리하세요. 각 주소의 볼륨, PnL, 수수료를 추적합니다.
        </p>
      </div>

      {/* Add Address Form */}
      <div className="bg-hl-bg-secondary border border-hl-border rounded-xl p-4 md:p-5 glow-hover">
        <h2 className="text-sm font-medium text-hl-text-primary mb-1">
          Add New Address
        </h2>
        <p className="text-xs text-hl-text-tertiary mb-4">
          0x로 시작하는 Hyperliquid 지갑 주소를 입력하세요. 라벨은 구분용 이름입니다.
        </p>
        <AddressInput onAdd={handleAdd} />
      </div>

      {/* Address List */}
      <div className="bg-hl-bg-secondary border border-hl-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-hl-border">
          <h2 className="text-sm font-medium text-hl-text-primary">
            Tracked Addresses ({addresses.length})
          </h2>
          <p className="text-xs text-hl-text-tertiary mt-1">
            추적 중인 주소 목록입니다. 왼쪽 핸들을 드래그하여 순서를 변경할 수 있습니다.
          </p>
        </div>

        {addresses.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <p className="text-sm text-hl-text-tertiary">
              아직 추적 중인 주소가 없습니다. 위에서 지갑 주소를 추가해 주세요.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-hl-border/50">
            {addresses.map((addr, index) => (
              <div
                key={addr.address}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDrop={() => handleDrop(index)}
                onDragEnd={handleDragEnd}
                className={`px-5 py-5 transition-all ${
                  dragIndex === index
                    ? "opacity-40 scale-[0.98]"
                    : dragOverIndex === index
                    ? "border-t-2 border-t-hl-accent bg-hl-accent/5"
                    : "hover:bg-hl-bg-hover/50"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4 flex-1">
                    {/* Drag handle */}
                    <div
                      className="w-11 h-11 rounded-lg bg-hl-bg-tertiary border border-hl-border flex items-center justify-center mt-0.5 cursor-grab active:cursor-grabbing hover:border-hl-accent/50 hover:bg-hl-bg-hover transition-colors"
                      title="드래그하여 순서 변경"
                    >
                      <svg
                        className="w-5 h-5 text-hl-text-tertiary"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5"
                        />
                      </svg>
                    </div>
                    <div className="flex-1">
                      {/* Label (editable) */}
                      <input
                        type="text"
                        value={addr.label}
                        onChange={(e) =>
                          handleLabelChange(addr.address, e.target.value)
                        }
                        className="bg-transparent text-sm font-semibold text-hl-text-primary focus:outline-none border-b border-transparent focus:border-hl-accent/30 transition-colors mb-1 block"
                      />

                      {/* Full address with copy */}
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-xs font-mono text-hl-text-tertiary">
                          {formatAddress(addr.address)}
                        </span>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(addr.address);
                          }}
                          className="text-hl-text-tertiary hover:text-hl-text-secondary transition-colors"
                          title="주소 복사"
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
                      </div>

                      {/* External links */}
                      <div className="flex items-center gap-2 md:gap-3 flex-wrap">
                        <a
                          href={`https://hypurrscan.io/address/${addr.address}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-hl-accent/10 text-hl-accent text-xs font-medium hover:bg-hl-accent/20 transition-colors"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                          </svg>
                          Hypurrscan
                        </a>
                        <a
                          href={`https://app.hyperliquid.xyz/explorer/address/${addr.address}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-hl-bg-tertiary text-hl-text-secondary text-xs font-medium hover:text-hl-text-primary hover:bg-hl-bg-hover transition-colors"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                          </svg>
                          Hyperliquid Explorer
                        </a>
                      </div>
                    </div>
                  </div>

                  {/* Delete button */}
                  <button
                    onClick={() => handleRemove(addr.address)}
                    className="p-2 rounded-lg text-hl-text-tertiary hover:text-hl-red hover:bg-hl-red/10 transition-colors ml-4"
                    title="주소 삭제"
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
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
