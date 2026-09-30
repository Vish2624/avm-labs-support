"use client";

import { useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, XIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PriceGrid, type PriceEdit } from "./price-grid";
import { fetcher } from "@/lib/utils/fetcher";
import type { Location } from "@/types/location";
import type { Test } from "@/types/test";
import type { CatalogItemDetail, CatalogType } from "@/types/catalog";
import type { ServiceType } from "@/lib/constants/service-types";

export const TYPE_LABELS: Record<CatalogType, { one: string; many: string }> = {
  test: { one: "test", many: "Tests" },
  component: { one: "component", many: "Components" },
  calculated: { one: "calculated parameter", many: "Calculated parameters" },
};

const TYPE_BADGE: Record<Test["testType"], string> = {
  test: "Test",
  component: "Component",
  parameter: "Parameter",
  calculated: "Calculated",
};

type Tab = "details" | "prices" | "parameters" | "sources" | "names" | "used";

async function send<T>(url: string, method: string, body: unknown): Promise<T> {
  const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error ?? "Something went wrong.");
  return data as T;
}

// Edit one Test Master item. What's editable depends on the type:
// tests and components have prices; components have parameters; calculated
// parameters have source tests and no price. Every type has other names
// (aliases) and a "used in" view.
export function CatalogEditor({
  type,
  id,
  locations,
  allTests,
  profiles = [],
  onCreated,
  onChanged,
  startOnNextStep = false,
}: {
  type: CatalogType;
  /** null = creating a new item. */
  id: string | null;
  /** Just created: open on what to fill in next (prices, or source tests) instead of Details. */
  startOnNextStep?: boolean;
  locations: Location[];
  /** Every catalog row — for picking a calculated parameter's sources. */
  allTests: Test[];
  /** Profiles a calculated parameter can be ordered within (code + name). */
  profiles?: { code: string; name: string }[];
  onCreated: (id: string) => void;
  onChanged: () => void;
}) {
  const { data: detail, mutate } = useSWR<CatalogItemDetail>(id ? `/api/admin/catalog/${id}` : null, fetcher);
  const nextStep: Tab = type === "calculated" ? "sources" : "prices";
  const [tab, setTab] = useState<Tab>(startOnNextStep ? nextStep : "details");
  const [saving, setSaving] = useState(false);

  async function patch(body: Record<string, unknown>, success: string): Promise<boolean> {
    if (!id) return false;
    setSaving(true);
    try {
      const next = await send<CatalogItemDetail>(`/api/admin/catalog/${id}`, "PATCH", body);
      await mutate(next, false);
      onChanged();
      toast.success(success);
      return true;
    } catch (error) {
      toast.error((error as Error).message);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function saveDetails(values: DetailsValues) {
    if (id) {
      await patch({ action: "details", ...values }, "Saved");
      return;
    }
    setSaving(true);
    try {
      const { test } = await send<{ test: Test }>("/api/admin/catalog", "POST", { type, ...values });
      toast.success(`Created — now add its ${type === "calculated" ? "source tests" : "prices"}.`);
      onChanged();
      onCreated(test.id);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const loading = Boolean(id) && !detail;
  const test = detail?.test;

  return (
    <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
      <TabsList className="flex-wrap">
        <TabsTrigger value="details">Details</TabsTrigger>
        {type !== "calculated" ? (
          <TabsTrigger value="prices" disabled={!id}>
            Prices &amp; TAT
          </TabsTrigger>
        ) : null}
        {type === "component" ? (
          <TabsTrigger value="parameters" disabled={!id}>
            Parameters{detail ? ` (${detail.parameters.length})` : ""}
          </TabsTrigger>
        ) : null}
        {type === "calculated" ? (
          <TabsTrigger value="sources" disabled={!id}>
            Source tests{detail ? ` (${detail.sources.length})` : ""}
          </TabsTrigger>
        ) : null}
        <TabsTrigger value="names" disabled={!id}>
          Other names{detail ? ` (${detail.aliases.length})` : ""}
        </TabsTrigger>
        <TabsTrigger value="used" disabled={!id}>
          Used in
        </TabsTrigger>
      </TabsList>

      <TabsContent value="details" className="mt-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <DetailsForm
            key={test?.id ?? "new"}
            type={type}
            initial={
              test
                ? {
                    code: test.code,
                    officialName: test.officialName,
                    shortName: test.shortName,
                    description: test.description,
                    viaProfileCode: test.viaProfileCode,
                  }
                : { code: "", officialName: "", shortName: null, description: null, viaProfileCode: null }
            }
            profiles={profiles}
            isNew={!id}
            saving={saving}
            onSubmit={saveDetails}
          />
        )}
      </TabsContent>

      {detail ? (
        <>
          <TabsContent value="prices" className="mt-4">
            <PriceGrid
              locations={locations}
              prices={detail.prices}
              saving={saving}
              onSave={(edit: PriceEdit) => patch({ action: "setPrice", ...edit }, "Price saved")}
              onRemove={(locationId: string, serviceType: ServiceType) =>
                patch({ action: "removePrice", locationId, serviceType }, "Price removed")
              }
              onMove={(to: ServiceType) =>
                void patch({ action: "moveServiceType", to }, `Moved to ${to === "outsource" ? "Outsourced" : "In-House"}`)
              }
            />
            <p className="mt-3 text-xs text-muted-foreground">
              Each saved price is recorded in Updates, like an Excel upload. Customers are told at least 12 hrs, and days
              beyond 24 hrs (48 hrs → 2 days).
            </p>
          </TabsContent>

          <TabsContent value="parameters" className="mt-4">
            <ParametersEditor
              key={detail.parameters.map((p) => `${p.id}:${p.officialName}`).join("|")}
              initial={detail.parameters}
              saving={saving}
              onSave={(parameters) => patch({ action: "parameters", parameters }, "Parameters saved")}
            />
          </TabsContent>

          <TabsContent value="sources" className="mt-4">
            <SourcesEditor
              key={detail.sources.map((s) => s.id).join("|")}
              selfId={detail.test.id}
              initial={detail.sources.map((s) => s.id)}
              allTests={allTests}
              saving={saving}
              onSave={(sourceIds) => patch({ action: "sources", sourceIds }, "Source tests saved")}
            />
          </TabsContent>

          <TabsContent value="names" className="mt-4">
            <AliasesEditor testId={detail.test.id} aliases={detail.aliases} onChanged={async () => {
              await mutate();
              onChanged();
            }} />
          </TabsContent>

          <TabsContent value="used" className="mt-4">
            <UsedIn detail={detail} />
          </TabsContent>
        </>
      ) : null}
    </Tabs>
  );
}

interface DetailsValues {
  code: string;
  officialName: string;
  shortName: string | null;
  description: string | null;
  viaProfileCode: string | null;
}

function DetailsForm({
  type,
  initial,
  profiles,
  isNew,
  saving,
  onSubmit,
}: {
  type: CatalogType;
  initial: DetailsValues;
  profiles: { code: string; name: string }[];
  isNew: boolean;
  saving: boolean;
  onSubmit: (values: DetailsValues) => void;
}) {
  const [values, setValues] = useState(initial);
  const set = <K extends keyof DetailsValues>(key: K, value: DetailsValues[K]) => setValues((prev) => ({ ...prev, [key]: value }));

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(values);
      }}
      className="flex flex-col gap-3.5"
    >
      <div className="grid grid-cols-[1fr_2fr] gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="catalog-code">Code</Label>
          <Input
            id="catalog-code"
            value={values.code}
            onChange={(event) => set("code", event.target.value)}
            required={type !== "calculated"}
            placeholder={type === "calculated" && isNew ? "Automatic" : undefined}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="catalog-name">Name</Label>
          <Input id="catalog-name" value={values.officialName} onChange={(event) => set("officialName", event.target.value)} required />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="catalog-short">Short name</Label>
        <Input
          id="catalog-short"
          value={values.shortName ?? ""}
          placeholder="Optional, e.g. eGFR"
          onChange={(event) => set("shortName", event.target.value || null)}
          className="max-w-56"
        />
        <p className="text-xs text-muted-foreground">Searching the short name finds this exactly.</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="catalog-description">{type === "calculated" ? "Note for agents" : "Description"}</Label>
        <Textarea
          id="catalog-description"
          value={values.description ?? ""}
          placeholder={type === "calculated" ? "Optional, e.g. Also needs Urine Creatinine, which isn't in the price list yet." : "Optional"}
          onChange={(event) => set("description", event.target.value || null)}
        />
        {type === "calculated" ? (
          <p className="text-xs text-muted-foreground">Shown on this parameter&apos;s card in the Quote search.</p>
        ) : null}
      </div>
      {type === "calculated" ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="catalog-via">Order as</Label>
          <select
            id="catalog-via"
            value={values.viaProfileCode ?? ""}
            onChange={(event) => set("viaProfileCode", event.target.value || null)}
            className="h-9 max-w-80 rounded-lg border border-input bg-card px-2.5 text-sm"
          >
            <option value="">Its source tests (added one by one)</option>
            {profiles.map((profile) => (
              <option key={profile.code} value={profile.code}>
                Whole profile: {profile.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            A whole profile means agents are offered that profile instead, e.g. eGFR is only done with the Kidney Function Test.
          </p>
        </div>
      ) : null}
      <Button type="submit" disabled={saving} className="w-fit">
        {saving ? "Saving…" : isNew ? `Create ${TYPE_LABELS[type].one}` : "Save details"}
      </Button>
    </form>
  );
}

function ParametersEditor({
  initial,
  saving,
  onSave,
}: {
  initial: CatalogItemDetail["parameters"];
  saving: boolean;
  onSave: (parameters: { id?: string; name: string }[]) => void;
}) {
  const [rows, setRows] = useState<{ key: string; id?: string; name: string }[]>(() =>
    initial.map((p) => ({ key: p.id, id: p.id, name: p.officialName }))
  );
  const [draft, setDraft] = useState("");
  const removed = initial.filter((p) => !rows.some((row) => row.id === p.id));
  const dirty =
    removed.length > 0 ||
    rows.length !== initial.length ||
    rows.some((row, i) => row.id !== initial[i]?.id || row.name !== initial[i]?.officialName);

  function add() {
    const name = draft.trim();
    if (!name) return;
    setRows((prev) => [...prev, { key: `new-${Date.now()}`, name }]);
    setDraft("");
  }

  function move(index: number, by: number) {
    setRows((prev) => {
      const next = [...prev];
      const [row] = next.splice(index, 1);
      next.splice(index + by, 0, row);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        What this component reports. Parameters are never priced or ordered on their own — searching one (e.g.
        &ldquo;hemoglobin&rdquo;) finds this component.
      </p>
      <ol className="flex max-h-80 flex-col gap-1.5 overflow-y-auto">
        {rows.map((row, index) => (
          <li key={row.key} className="flex items-center gap-2">
            <span className="w-6 text-right text-xs text-muted-foreground tabular-nums">{index + 1}</span>
            <Input
              value={row.name}
              onChange={(event) => setRows((prev) => prev.map((r) => (r.key === row.key ? { ...r, name: event.target.value } : r)))}
              className="h-8 flex-1"
            />
            {!row.id ? <Badge variant="success">New</Badge> : null}
            <Button type="button" size="icon-sm" variant="ghost" aria-label="Move up" disabled={index === 0} onClick={() => move(index, -1)}>
              <ArrowUpIcon />
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label="Move down"
              disabled={index === rows.length - 1}
              onClick={() => move(index, 1)}
            >
              <ArrowDownIcon />
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={`Remove ${row.name}`}
              className="text-muted-foreground hover:text-destructive"
              onClick={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}
            >
              <XIcon />
            </Button>
          </li>
        ))}
      </ol>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          add();
        }}
      >
        <Input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Add a parameter, e.g. Mean Platelet Volume (MPV)" />
        <Button type="submit" variant="outline" disabled={!draft.trim()}>
          <PlusIcon /> Add
        </Button>
      </form>
      {removed.length > 0 ? (
        <p className="text-xs text-destructive">Will be removed: {removed.map((p) => p.officialName).join(", ")}</p>
      ) : null}
      <Button type="button" className="w-fit" disabled={saving || !dirty} onClick={() => onSave(rows.map(({ id, name }) => ({ id, name })))}>
        {saving ? "Saving…" : "Save parameters"}
      </Button>
      <p className="text-xs text-muted-foreground">Use the arrows to set the order; nothing changes until you save.</p>
    </div>
  );
}

function SourcesEditor({
  selfId,
  initial,
  allTests,
  saving,
  onSave,
}: {
  selfId: string;
  initial: string[];
  allTests: Test[];
  saving: boolean;
  onSave: (sourceIds: string[]) => void;
}) {
  const [selected, setSelected] = useState<string[]>(initial);
  const [query, setQuery] = useState("");
  const byId = new Map(allTests.map((t) => [t.id, t]));
  const candidates = allTests.filter((t) => t.id !== selfId && t.testType !== "parameter" && t.active);
  const normalized = query.trim().toLowerCase();
  const matches = normalized
    ? candidates
        .filter((t) => !selected.includes(t.id) && `${t.code} ${t.officialName} ${t.shortName ?? ""}`.toLowerCase().includes(normalized))
        .slice(0, 8)
    : [];
  const dirty = selected.join("|") !== initial.join("|");

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        The tests this result is calculated from. Searching it in the Quote offers these tests to add. A source can itself
        be calculated (e.g. A/G Ratio uses Serum Globulin) — its own tests are added instead.
      </p>
      <div className="flex min-h-10 flex-wrap gap-1.5 rounded-xl border border-border/60 p-2">
        {selected.length === 0 ? <span className="px-1 text-sm text-muted-foreground">No source tests yet.</span> : null}
        {selected.map((sourceId) => {
          const source = byId.get(sourceId);
          return (
            <span key={sourceId} className="flex items-center gap-1.5 rounded-lg bg-muted px-2 py-1 text-sm">
              {source?.officialName ?? "Unknown test"}
              {source && source.testType !== "test" ? (
                <span className="text-[10.5px] text-muted-foreground uppercase">{TYPE_BADGE[source.testType]}</span>
              ) : null}
              <button
                type="button"
                aria-label={`Remove ${source?.officialName ?? "source"}`}
                className="text-muted-foreground hover:text-destructive"
                onClick={() => setSelected((prev) => prev.filter((id) => id !== sourceId))}
              >
                <XIcon className="size-3.5" />
              </button>
            </span>
          );
        })}
      </div>
      <div className="relative">
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a test to add, e.g. albumin" />
        {matches.length > 0 ? (
          <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-border bg-popover shadow-elevated">
            {matches.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                  onClick={() => {
                    setSelected((prev) => [...prev, t.id]);
                    setQuery("");
                  }}
                >
                  <span className="flex-1">{t.officialName}</span>
                  <span className="font-mono text-xs text-muted-foreground">{t.code}</span>
                  <Badge variant="outline">{TYPE_BADGE[t.testType]}</Badge>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <Button type="button" className="w-fit" disabled={saving || !dirty || selected.length === 0} onClick={() => onSave(selected)}>
        {saving ? "Saving…" : "Save source tests"}
      </Button>
    </div>
  );
}

function AliasesEditor({
  testId,
  aliases,
  onChanged,
}: {
  testId: string;
  aliases: CatalogItemDetail["aliases"];
  onChanged: () => Promise<void>;
}) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    const alias = draft.trim();
    if (!alias) return;
    setBusy(true);
    try {
      await send("/api/admin/aliases", "POST", {
        testId,
        alias,
        aliasType: !/\s/.test(alias) && alias.length <= 10 ? "abbreviation" : "customer_term",
        confidence: 100,
      });
      setDraft("");
      await onChanged();
      toast.success(`"${alias}" added`);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(aliasId: string, alias: string) {
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/aliases/${aliasId}`, { method: "DELETE" });
      if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? "Couldn't remove.");
      await onChanged();
      toast.success(`"${alias}" removed`);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Other names customers use. Searching any of them finds this item, e.g. &ldquo;Vit D&rdquo;, &ldquo;sugar test&rdquo;.
      </p>
      <div className="flex min-h-10 flex-wrap gap-1.5 rounded-xl border border-border/60 p-2">
        {aliases.length === 0 ? <span className="px-1 text-sm text-muted-foreground">No other names yet.</span> : null}
        {aliases.map((alias) => (
          <span key={alias.id} className="flex items-center gap-1.5 rounded-lg bg-muted px-2 py-1 text-sm">
            {alias.alias}
            <button
              type="button"
              aria-label={`Remove ${alias.alias}`}
              disabled={busy}
              className="text-muted-foreground hover:text-destructive"
              onClick={() => void remove(alias.id, alias.alias)}
            >
              <XIcon className="size-3.5" />
            </button>
          </span>
        ))}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void add();
        }}
      >
        <Input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Add another name" />
        <Button type="submit" variant="outline" disabled={busy || !draft.trim()}>
          <PlusIcon /> Add
        </Button>
      </form>
    </div>
  );
}

function UsedIn({ detail }: { detail: CatalogItemDetail }) {
  const { profiles, calculated } = detail.usedIn;
  if (profiles.length === 0 && calculated.length === 0) {
    return <p className="text-sm text-muted-foreground">Not used in any profile or calculated parameter.</p>;
  }
  return (
    <div className="flex flex-col gap-4 text-sm">
      {profiles.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <p className="font-medium">Profiles ({profiles.length})</p>
          <ul className="flex flex-wrap gap-1.5">
            {profiles.map((p) => (
              <li key={p.id} className="rounded-lg bg-muted px-2 py-1">
                {p.name} <span className="font-mono text-xs text-muted-foreground">{p.code}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {calculated.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <p className="font-medium">Calculated parameters derived from it ({calculated.length})</p>
          <ul className="flex flex-wrap gap-1.5">
            {calculated.map((c) => (
              <li key={c.id} className="rounded-lg bg-muted px-2 py-1">
                {c.name}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">Deactivating this hides it from the Quote search everywhere it&apos;s used.</p>
    </div>
  );
}
