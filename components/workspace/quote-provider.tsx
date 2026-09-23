"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { Location } from "@/types/location";
import type { QuotationLineItem, QuotationPackageLine } from "@/types/quotation";

const LOCATION_STORAGE_KEY = "avm-location";

interface QuoteContextValue {
  locations: Location[];
  locationId: string;
  selectedLocation: Location | null;
  /** Switching location clears the quote — its prices are in the old location's currency. */
  setLocationId: (locationId: string) => void;
  lineItems: QuotationLineItem[];
  addLineItem: (item: QuotationLineItem) => void;
  addLineItems: (items: QuotationLineItem[]) => void;
  removeLineItem: (key: { kind: "test"; testId: string } | { kind: "package"; profileId: string }) => void;
  /** Swap the tests a package covers for the package itself. */
  applyPackage: (pkg: QuotationPackageLine) => void;
  clear: () => void;
  customerName: string;
  setCustomerName: (name: string) => void;
}

const QuoteContext = createContext<QuoteContextValue | null>(null);

/**
 * The in-progress quotation, held in client memory only (never persisted to
 * Supabase). Lives in the dashboard layout rather than the Workspace page so
 * the cart and location survive switching to Packages/Updates and back.
 */
export function QuoteProvider({ locations, children }: { locations: Location[]; children: React.ReactNode }) {
  const [locationId, setLocationIdState] = useState(locations[0]?.id ?? "");
  const [lineItems, setLineItems] = useState<QuotationLineItem[]>([]);
  const [customerName, setCustomerName] = useState("");

  // Restore the agent's last location. localStorage isn't available during
  // SSR, so this has to be a mount-time effect rather than initial state.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(LOCATION_STORAGE_KEY);
      if (saved && locations.some((location) => location.id === saved)) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration of a persisted preference
        setLocationIdState(saved);
      }
    } catch {
      // Storage blocked — keep the default location.
    }
  }, [locations]);

  const persistLocation = useCallback((id: string) => {
    setLocationIdState(id);
    try {
      window.localStorage.setItem(LOCATION_STORAGE_KEY, id);
    } catch {
      // Storage blocked — the choice just won't be remembered.
    }
  }, []);

  const setLocationId = useCallback(
    (id: string) => {
      if (id === locationId) return;
      persistLocation(id);
      setLineItems((prev) => {
        if (prev.length === 0) return prev;
        toast("Location changed — quotation cleared.");
        return [];
      });
    },
    [locationId, persistLocation]
  );

  const addLineItems = useCallback((items: QuotationLineItem[]) => {
    setLineItems((prev) => {
      const next = [...prev];
      for (const item of items) {
        if (item.kind === "test") {
          if (next.some((line) => line.kind === "test" && line.testId === item.testId)) continue;
          const coveringPackage = next.find(
            (line) => line.kind === "package" && line.tests.some((test) => test.testId === item.testId)
          );
          if (coveringPackage) {
            toast(`${item.name} is already included in ${coveringPackage.name}.`);
            continue;
          }
        } else if (next.some((line) => line.kind === "package" && line.profileId === item.profileId)) {
          continue;
        }
        next.push(item);
      }
      return next.length === prev.length ? prev : next;
    });
  }, []);

  const addLineItem = useCallback((item: QuotationLineItem) => addLineItems([item]), [addLineItems]);

  const removeLineItem = useCallback<QuoteContextValue["removeLineItem"]>((key) => {
    setLineItems((prev) =>
      prev.filter((line) =>
        key.kind === "test"
          ? !(line.kind === "test" && line.testId === key.testId)
          : !(line.kind === "package" && line.profileId === key.profileId)
      )
    );
  }, []);

  const applyPackage = useCallback((pkg: QuotationPackageLine) => {
    const covered = new Set(pkg.tests.map((test) => test.testId));
    setLineItems((prev) => [
      ...prev.filter((line) => !(line.kind === "test" && covered.has(line.testId))),
      ...(prev.some((line) => line.kind === "package" && line.profileId === pkg.profileId) ? [] : [pkg]),
    ]);
    toast.success(`Switched to ${pkg.name}`);
  }, []);

  const clear = useCallback(() => {
    setLineItems((prev) => {
      if (prev.length === 0) return prev;
      toast("Quotation cleared.");
      return [];
    });
  }, []);

  const value = useMemo<QuoteContextValue>(
    () => ({
      locations,
      locationId,
      selectedLocation: locations.find((location) => location.id === locationId) ?? null,
      setLocationId,
      lineItems,
      addLineItem,
      addLineItems,
      removeLineItem,
      applyPackage,
      clear,
      customerName,
      setCustomerName,
    }),
    [
      locations,
      locationId,
      setLocationId,
      lineItems,
      addLineItem,
      addLineItems,
      removeLineItem,
      applyPackage,
      clear,
      customerName,
    ]
  );

  return <QuoteContext.Provider value={value}>{children}</QuoteContext.Provider>;
}

export function useQuote(): QuoteContextValue {
  const context = useContext(QuoteContext);
  if (!context) throw new Error("useQuote must be used inside <QuoteProvider>");
  return context;
}
