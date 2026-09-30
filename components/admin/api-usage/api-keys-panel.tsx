"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { KeyRoundIcon, PauseIcon, PencilIcon, PlayIcon, PlusIcon, Trash2Icon, ZapIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { API_KEY_ROLES, API_KEY_ROLE_LABELS, type ApiKey, type ApiKeyRole } from "@/types/api-key";
import type { CallStats, KeyState } from "@/lib/api-usage/summarize";

export interface KeyRow {
  key: ApiKey;
  state: KeyState;
  today: CallStats;
  /** Success rate today, 0-1, or null with no finished calls. */
  successRate: number | null;
}

const STATE_STYLES: Record<KeyState, { label: string; dot: string; badge: string }> = {
  working: { label: "Working", dot: "bg-success", badge: "bg-success/15 text-success-foreground" },
  idle: { label: "Not used today", dot: "bg-muted-foreground/40", badge: "bg-muted text-muted-foreground" },
  failing: { label: "Failing", dot: "bg-warning", badge: "bg-warning/20 text-warning-foreground" },
  limit: { label: "Daily limit reached", dot: "bg-destructive", badge: "bg-destructive/12 text-destructive" },
  paused: { label: "Paused", dot: "bg-muted-foreground/40", badge: "bg-muted text-muted-foreground" },
  missing: { label: "Not set in Vercel", dot: "bg-muted-foreground/40", badge: "bg-muted text-muted-foreground" },
};

const seconds = (ms: number | null) => (ms === null ? "—" : `${(ms / 1000).toFixed(1)} s`);
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

async function send(url: string, method: string, body?: unknown) {
  const response = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error ?? "Something went wrong.");
  return json;
}

// Requests used today against the key's daily limit. Colour follows how
// full it is, and the numbers are always written out beside it.
function UsageMeter({ used, limit }: { used: number; limit: number | null }) {
  if (!limit) {
    return (
      <p className="text-[12.5px] text-muted-foreground">
        <span className="font-semibold text-foreground tabular-nums">{used.toLocaleString()}</span> requests today · no daily
        limit set
      </p>
    );
  }
  const share = Math.min(1, used / limit);
  const tone = share >= 0.9 ? "bg-destructive" : share >= 0.7 ? "bg-warning" : "bg-success";
  return (
    <div className="flex flex-col gap-1.5">
      <div
        className="h-2 overflow-hidden rounded-full bg-muted"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={used}
        aria-label="Requests used today"
      >
        <div className={cn("h-full rounded-full transition-[width]", tone)} style={{ width: `${Math.max(share * 100, used > 0 ? 2 : 0)}%` }} />
      </div>
      <p className="text-[12.5px] text-muted-foreground">
        <span className="font-semibold text-foreground tabular-nums">{used.toLocaleString()}</span> of{" "}
        <span className="tabular-nums">{limit.toLocaleString()}</span> used today ·{" "}
        <span className="tabular-nums">{Math.max(0, limit - used).toLocaleString()}</span> left
      </p>
    </div>
  );
}

function RoleSelect({ value, onChange }: { value: ApiKeyRole; onChange: (role: ApiKeyRole) => void }) {
  return (
    <Select value={value} onValueChange={(next) => next && onChange(next as ApiKeyRole)}>
      <SelectTrigger className="w-full">
        <SelectValue>{(v: string) => API_KEY_ROLE_LABELS[v as ApiKeyRole]}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {API_KEY_ROLES.map((role) => (
          <SelectItem key={role} value={role}>
            {API_KEY_ROLE_LABELS[role]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

interface FormValues {
  label: string;
  role: ApiKeyRole;
  apiKey: string;
  dailyLimit: string;
}

// Add a key, or edit one's name / feature / daily limit.
function KeyDialog({
  open,
  onOpenChange,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: ApiKey | null;
  onSaved: () => void;
}) {
  const [values, setValues] = useState<FormValues>({ label: "", role: "shared", apiKey: "", dailyLimit: "" });
  const [saving, setSaving] = useState(false);
  const [openedFor, setOpenedFor] = useState<string | null | undefined>(undefined);
  // Reset the form each time it opens.
  const openKey = open ? (editing?.id ?? null) : undefined;
  if (openKey !== openedFor) {
    setOpenedFor(openKey);
    if (open) {
      setValues(
        editing
          ? { label: editing.label, role: editing.role, apiKey: "", dailyLimit: editing.dailyLimit ? String(editing.dailyLimit) : "" }
          : { label: "", role: "shared", apiKey: "", dailyLimit: "" }
      );
    }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const limit = values.dailyLimit.trim() ? Number(values.dailyLimit.replace(/[,\s]/g, "")) : null;
    if (limit !== null && !(Number.isInteger(limit) && limit > 0)) {
      toast.error("Daily limit must be a whole number, or blank.");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await send(`/api/admin/api-keys/${editing.id}`, "PATCH", { label: values.label, role: values.role, dailyLimit: limit });
        toast.success("Key updated");
      } else {
        await send("/api/admin/api-keys", "POST", { label: values.label, role: values.role, apiKey: values.apiKey, dailyLimit: limit });
        toast.success("Key checked with Google and added");
      }
      onOpenChange(false);
      onSaved();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <form onSubmit={save} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${editing.label}` : "Add a Gemini key"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Change its name, which feature uses it first, or its daily limit."
                : "Get a free key at aistudio.google.com/apikey — one per Google account, so each has its own daily quota. It's checked with Google before it's saved, and used straight away."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="key-label">Name</Label>
            <Input
              id="key-label"
              value={values.label}
              maxLength={60}
              placeholder="e.g. Ramis account 2"
              onChange={(event) => setValues({ ...values, label: event.target.value })}
            />
          </div>
          {editing ? null : (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="key-value">API key</Label>
              <Input
                id="key-value"
                value={values.apiKey}
                autoComplete="off"
                spellCheck={false}
                placeholder="AIza…"
                className="font-mono"
                onChange={(event) => setValues({ ...values, apiKey: event.target.value.trim() })}
              />
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label>Used for</Label>
            <RoleSelect value={values.role} onChange={(role) => setValues({ ...values, role })} />
            <p className="text-xs text-muted-foreground">
              A feature tries its own keys first, then Shared keys, then other features&apos; keys, then Backup keys.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="key-limit">Daily limit (requests per day)</Label>
            <Input
              id="key-limit"
              inputMode="numeric"
              value={values.dailyLimit}
              placeholder="Optional — from aistudio.google.com → Usage"
              onChange={(event) => setValues({ ...values, dailyLimit: event.target.value })}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !values.label.trim() || (!editing && values.apiKey.length < 10)}>
              {saving ? (editing ? "Saving…" : "Checking key…") : editing ? "Save" : "Add key"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// The key cards on Admin > API usage, with add / test / edit / pause / delete.
export function ApiKeysPanel({ rows }: { rows: KeyRow[] }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<{ open: boolean; editing: ApiKey | null }>({ open: false, editing: null });
  const [deleting, setDeleting] = useState<ApiKey | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function run(id: string, action: () => Promise<void>) {
    setBusy(id);
    try {
      await action();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const test = (key: ApiKey) =>
    run(key.id, async () => {
      const result = await send(`/api/admin/api-keys/${key.id}`, "POST");
      (result.ok ? toast.success : toast.error)(`${key.label}: ${result.message}${result.ms ? ` (${seconds(result.ms)})` : ""}`);
    });
  const toggle = (key: ApiKey) =>
    run(key.id, async () => {
      await send(`/api/admin/api-keys/${key.id}`, "PATCH", { active: !key.active });
      toast.success(key.active ? `${key.label} paused — it won't be used` : `${key.label} is back in use`);
      router.refresh();
    });
  const remove = (key: ApiKey) =>
    run(key.id, async () => {
      await send(`/api/admin/api-keys/${key.id}`, "DELETE");
      toast.success(`${key.label} removed`);
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[13px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
          Keys · {rows.filter((row) => row.key.active && row.key.hint).length} in use
        </h2>
        <Button size="sm" onClick={() => setDialog({ open: true, editing: null })}>
          <PlusIcon /> Add key
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.map(({ key, state, today, successRate }) => {
          const style = STATE_STYLES[state];
          return (
            <div
              key={key.id}
              className={cn("flex flex-col gap-3 rounded-xl border border-border bg-card px-4 py-3.5", !key.active && "opacity-70")}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
                    <KeyRoundIcon className="size-3.5 shrink-0 text-muted-foreground" />
                    {key.label}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {API_KEY_ROLE_LABELS[key.role]} ·{" "}
                    <span className="font-mono">{key.hint ? `…${key.hint}` : "no value"}</span> ·{" "}
                    {key.envName ? `Vercel (${key.envName})` : "added here"}
                  </p>
                </div>
                <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-semibold", style.badge)}>
                  <span className={cn("size-2 rounded-full", style.dot)} />
                  {style.label}
                </span>
              </div>

              <UsageMeter used={today.used} limit={key.dailyLimit} />

              <dl className="grid grid-cols-3 gap-2 text-[12.5px]">
                <div>
                  <dt className="text-muted-foreground">Success</dt>
                  <dd className="font-semibold tabular-nums">{successRate === null ? "—" : `${Math.round(successRate * 100)}%`}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Typical time</dt>
                  <dd className="font-semibold tabular-nums">{seconds(today.p50)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Last used</dt>
                  <dd className="font-semibold tabular-nums">{today.lastAt ? time(today.lastAt) : "—"}</dd>
                </div>
              </dl>
              {today.quotaAt ? (
                <p className="text-[12.5px] text-destructive">
                  Hit its daily limit at {time(today.quotaAt)}
                  {today.okSinceQuota ? " — working again since" : ""}.
                </p>
              ) : null}

              <div className="flex flex-wrap gap-1.5 border-t border-border pt-3">
                <Button size="sm" variant="outline" disabled={busy === key.id || !key.hint} onClick={() => test(key)}>
                  <ZapIcon /> Test
                </Button>
                <Button size="sm" variant="outline" disabled={busy === key.id} onClick={() => setDialog({ open: true, editing: key })}>
                  <PencilIcon /> Edit
                </Button>
                <Button size="sm" variant="outline" disabled={busy === key.id} onClick={() => toggle(key)}>
                  {key.active ? <PauseIcon /> : <PlayIcon />} {key.active ? "Pause" : "Resume"}
                </Button>
                {key.envName ? null : (
                  <Button size="sm" variant="outline" disabled={busy === key.id} onClick={() => setDeleting(key)}>
                    <Trash2Icon /> Delete
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <KeyDialog
        open={dialog.open}
        editing={dialog.editing}
        onOpenChange={(open) => setDialog((current) => ({ ...current, open }))}
        onSaved={() => router.refresh()}
      />

      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.label}?</AlertDialogTitle>
            <AlertDialogDescription>
              The app stops using this key straight away and it&apos;s removed from the database. Its usage history is kept
              without its name.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleting && remove(deleting)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
