"use client";

import { createContext, useContext } from "react";

export interface TrackedAddress {
  address: string;
  label: string;
}

const STORAGE_KEY = "hlbot_addresses";

export function getStoredAddresses(): TrackedAddress[] {
  if (typeof window === "undefined") return [];
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function saveAddresses(addresses: TrackedAddress[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(addresses));
}

export function addAddress(address: string, label: string): TrackedAddress[] {
  const addresses = getStoredAddresses();
  if (addresses.find((a) => a.address.toLowerCase() === address.toLowerCase()))
    return addresses;
  const updated = [...addresses, { address, label }];
  saveAddresses(updated);
  return updated;
}

export function removeAddress(address: string): TrackedAddress[] {
  const addresses = getStoredAddresses().filter(
    (a) => a.address.toLowerCase() !== address.toLowerCase()
  );
  saveAddresses(addresses);
  return addresses;
}

export const AddressContext = createContext<{
  addresses: TrackedAddress[];
  setAddresses: (addresses: TrackedAddress[]) => void;
}>({ addresses: [], setAddresses: () => {} });

export function useAddresses() {
  return useContext(AddressContext);
}
