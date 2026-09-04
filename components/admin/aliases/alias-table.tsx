"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { ALIAS_TYPE_LABELS } from "@/lib/constants/alias-types";
import type { AliasWithTest } from "@/lib/database/aliases";

// Test alias list — every admin-curated alternative/misspelled/customer
// term mapped to a catalog test.
export function AliasTable({
  aliases,
  onEdit,
  onToggleActive,
  onDelete,
}: {
  aliases: AliasWithTest[];
  onEdit: (alias: AliasWithTest) => void;
  onToggleActive: (alias: AliasWithTest, active: boolean) => void;
  onDelete: (alias: AliasWithTest) => void;
}) {
  if (aliases.length === 0) {
    return <p className="text-sm text-muted-foreground">No aliases yet.</p>;
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border/50 bg-card shadow-xs">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Alias</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Confidence</TableHead>
            <TableHead>Test</TableHead>
            <TableHead>Active</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {aliases.map((alias) => (
            <TableRow key={alias.id}>
              <TableCell>{alias.alias}</TableCell>
              <TableCell>
                <Badge variant="outline">{ALIAS_TYPE_LABELS[alias.aliasType]}</Badge>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">{alias.confidence}</TableCell>
              <TableCell>
                {alias.testOfficialName} <span className="text-muted-foreground">({alias.testCode})</span>
              </TableCell>
              <TableCell>
                <Switch checked={alias.active} onCheckedChange={(checked) => onToggleActive(alias, checked)} />
              </TableCell>
              <TableCell className="flex justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => onEdit(alias)}>
                  Edit
                </Button>
                <Button size="sm" variant="outline" onClick={() => onDelete(alias)}>
                  Delete
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
