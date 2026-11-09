"use client";

import { useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { PackageOpenIcon, PlusIcon, SearchXIcon } from "lucide-react";
import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CatalogEditor, TYPE_LABELS } from "./catalog-editor";
import { cn } from "@/lib/utils";
import { fetcher } from "@/lib/utils/fetcher";
import { formatCurrency } from "@/lib/utils/format-currency";
import { isPackage } from "@/lib/search/matching/is-package-name";
import type { Location } from "@/types/location";
import type { Test } from "@/types/test";
import type { CatalogListItem, CatalogType } from "@/types/catalog";

// Admin → Tests / Components / Calculated: every item of one type, with its
// price + TAT per location at a glance (Outsourced ones labelled), and an
// editor per item.
export function CatalogClient({ type, locations }: { type: CatalogType; locations: Location[] }) {
  const { data, mutate } = useSWR<{ items: CatalogListItem[] }>(`/api/admin/catalog?type=${type}`, fetcher);
  // Every catalog row, for picking a calculated parameter's sources.
  const { data: allTestsData, mutate: mutateAllTests } = useSWR<{ tests: Test[] }>(
    type === "calculated" ? "/api/admin/tests" : null,
    fetcher
  );
  // Profiles (not packages) a calculated parameter can be ordered within.
  const { data: profilesData } = useSWR<{ profiles: { code: string; name: string; active: boolean }[] }>(
    type === "calculated" ? "/api/admin/profiles" : null,
    fetcher
  );
  const profileOptions = (profilesData?.profiles ?? []).filter((p) => p.active && !isPackage(p));
  const items = data?.items;
  const priced = type !== "calculated";

  const [query, setQuery] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [justCreatedId, setJustCreatedId] = useState<string | null>(null);

  // An item has prices of one service type only (In-House or Outsourced).
  const priceAt = (item: CatalogListItem, locationId: string) => item.prices.find((p) => p.locationId === locationId);
  const missingPrice = (item: CatalogListItem) => priced && locations.some((l) => !priceAt(item, l.id));
  const missingCount = items?.filter((item) => item.active && missingPrice(item)).length ?? 0;

  const normalized = query.trim().toLowerCase();
  const filtered = (items ?? []).filter(
    (item) =>
      (!onlyMissing || missingPrice(item)) &&
      (!normalized || `${item.code} ${item.officialName} ${item.shortName ?? ""}`.toLowerCase().includes(normalized))
  );

  async function toggleActive(item: CatalogListItem, active: boolean) {
    try {
      const response = await fetch(`/api/admin/catalog/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setActive", active }),
      });
      if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? "Couldn't update.");
      toast.success(`${item.officialName} ${active ? "activated" : "hidden from search"}`);
      await mutate();
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  const refresh = () => {
    void mutate();
    void mutateAllTests();
  };
  const openItem = items?.find((item) => item.id === openId);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <Input
          placeholder={`Search ${TYPE_LABELS[type].many.toLowerCase()}…`}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="max-w-xs"
        />
        {priced && missingCount > 0 ? (
          <button
            type="button"
            onClick={() => setOnlyMissing((prev) => !prev)}
            className={cn(
              "h-8 rounded-full border px-3 text-[12.5px] font-medium transition-colors",
              onlyMissing
                ? "border-destructive/40 bg-destructive/10 text-destructive"
                : "border-border text-muted-foreground hover:text-foreground"
            )}
          >
            Missing a price · {missingCount}
          </button>
        ) : null}
        <span className="text-sm text-muted-foreground">{items ? `${filtered.length} of ${items.length}` : "Loading…"}</span>
        <Button size="sm" className="ml-auto" onClick={() => setCreating(true)}>
          <PlusIcon /> New {TYPE_LABELS[type].one}
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border/50 bg-card shadow-xs">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              {priced
                ? locations.map((location) => (
                    <TableHead key={location.id} className="text-right">
                      {location.name}
                      <span className="block text-[10.5px] font-normal text-muted-foreground">Price · TAT</span>
                    </TableHead>
                  ))
                : null}
              {type === "component" ? <TableHead className="text-right">Parameters</TableHead> : null}
              {type === "calculated" ? <TableHead>Calculated from</TableHead> : null}
              <TableHead>Active</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((item) => (
              <TableRow key={item.id} className={cn(!item.active && "opacity-55")}>
                <TableCell className="max-w-[280px]">
                  <button type="button" onClick={() => setOpenId(item.id)} className="text-left hover:underline">
                    <span className="block truncate font-medium">{item.officialName}</span>
                    <span className="font-mono text-xs text-muted-foreground">{item.code}</span>
                    {item.prices.some((p) => p.serviceType === "outsource") ? (
                      <span className="ml-2 rounded bg-destructive/10 px-1.5 py-px text-[10.5px] font-semibold text-destructive">
                        OUTSOURCED
                      </span>
                    ) : null}
                  </button>
                </TableCell>
                {priced
                  ? locations.map((location) => {
                      const price = priceAt(item, location.id);
                      return (
                        <TableCell key={location.id} className="text-right whitespace-nowrap tabular-nums">
                          {price ? (
                            <>
                              <span className="font-medium">{formatCurrency({ amount: price.price, currency: price.currencyCode })}</span>
                              <span className="block text-xs text-muted-foreground">{price.tatText}</span>
                            </>
                          ) : (
                            <span className="text-xs text-destructive">No price</span>
                          )}
                        </TableCell>
                      );
                    })
                  : null}
                {type === "component" ? <TableCell className="text-right tabular-nums">{item.parameterCount}</TableCell> : null}
                {type === "calculated" ? (
                  <TableCell className="max-w-[320px] text-sm text-muted-foreground">
                    {item.sourceNames.length > 0 ? item.sourceNames.join(" + ") : <span className="text-destructive">No source tests</span>}
                  </TableCell>
                ) : null}
                <TableCell>
                  <Switch checked={item.active} onCheckedChange={(checked) => void toggleActive(item, checked)} />
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="outline" onClick={() => setOpenId(item.id)}>
                    Edit
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {items && filtered.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={locations.length + 4} className="p-0 whitespace-normal">
                  {items.length === 0 ? (
                    <EmptyState
                      icon={PackageOpenIcon}
                      title={`No ${TYPE_LABELS[type].many.toLowerCase()} yet`}
                      description={
                        priced
                          ? "Upload a price list to fill the catalog, or add one by hand with the New button."
                          : "Add one with the New button."
                      }
                      action={priced ? { label: "Upload a price list", href: "/admin/upload" } : undefined}
                    />
                  ) : (
                    <EmptyState
                      icon={SearchXIcon}
                      title={onlyMissing && !normalized ? "Every item has a price" : "Nothing matches"}
                      description={
                        normalized ? `No ${TYPE_LABELS[type].one} matches “${query.trim()}”.` : undefined
                      }
                    />
                  )}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={creating || openId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCreating(false);
            setOpenId(null);
          }
        }}
      >
        <DialogContent className="max-h-[90svh] overflow-x-hidden overflow-y-auto sm:max-w-3xl [&>*]:min-w-0">
          <DialogHeader>
            <DialogTitle>
              {openItem ? (
                <>
                  {openItem.officialName} <span className="font-mono text-sm font-normal text-muted-foreground">{openItem.code}</span>
                </>
              ) : (
                `New ${TYPE_LABELS[type].one}`
              )}
            </DialogTitle>
          </DialogHeader>
          <CatalogEditor
            key={openId ?? "new"}
            type={type}
            id={openId}
            locations={locations}
            allTests={allTestsData?.tests ?? []}
            profiles={profileOptions}
            startOnNextStep={openId !== null && openId === justCreatedId}
            onCreated={(id) => {
              setCreating(false);
              setJustCreatedId(id);
              setOpenId(id);
            }}
            onChanged={refresh}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
