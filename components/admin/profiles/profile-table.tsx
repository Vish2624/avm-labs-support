"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import type { ProfileWithTestCount } from "@/lib/database/profiles";

// Profiles/packages list — every profile, active or not, with how many tests it bundles.
export function ProfileTable({
  profiles,
  onEdit,
  onToggleActive,
}: {
  profiles: ProfileWithTestCount[];
  onEdit: (profile: ProfileWithTestCount) => void;
  onToggleActive: (profile: ProfileWithTestCount, active: boolean) => void;
}) {
  if (profiles.length === 0) {
    return <p className="text-sm text-muted-foreground">No profiles yet.</p>;
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border/50 bg-card shadow-xs">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Code</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Tests</TableHead>
            <TableHead>Active</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {profiles.map((profile) => (
            <TableRow key={profile.id}>
              <TableCell>
                <Badge variant="outline">{profile.code}</Badge>
              </TableCell>
              <TableCell>{profile.name}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{profile.testCount}</TableCell>
              <TableCell>
                <Switch checked={profile.active} onCheckedChange={(checked) => onToggleActive(profile, checked)} />
              </TableCell>
              <TableCell className="flex justify-end">
                <Button size="sm" variant="outline" onClick={() => onEdit(profile)}>
                  Edit
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
