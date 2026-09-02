"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import type { Test } from "@/types/test";

// Master test catalog table — every test, active or not.
export function TestTable({
  tests,
  onView,
  onToggleActive,
}: {
  tests: Test[];
  onView: (test: Test) => void;
  onToggleActive: (test: Test, active: boolean) => void;
}) {
  if (tests.length === 0) {
    return <p className="text-sm text-muted-foreground">No tests yet.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Code</TableHead>
          <TableHead>Official name</TableHead>
          <TableHead>Category</TableHead>
          <TableHead>Active</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {tests.map((test) => (
          <TableRow key={test.id}>
            <TableCell>
              <Badge variant="outline">{test.code}</Badge>
            </TableCell>
            <TableCell>{test.officialName}</TableCell>
            <TableCell className="text-sm text-muted-foreground">{test.category ?? "—"}</TableCell>
            <TableCell>
              <Switch checked={test.active} onCheckedChange={(checked) => onToggleActive(test, checked)} />
            </TableCell>
            <TableCell className="flex justify-end">
              <Button size="sm" variant="outline" onClick={() => onView(test)}>
                Edit
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
