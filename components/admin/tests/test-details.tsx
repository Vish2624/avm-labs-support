import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { formatCurrency } from "@/lib/utils/format-currency";
import { formatTat } from "@/lib/utils/format-tat";
import { AVAILABILITY_LABELS } from "@/lib/constants/availability";
import { SERVICE_TYPE_LABELS } from "@/lib/constants/service-types";
import { ALIAS_TYPE_LABELS } from "@/lib/constants/alias-types";
import type { TestAlias } from "@/types/test";
import type { TestPrice } from "@/types/price";
import type { Location } from "@/types/location";

// Read-only: an existing test's aliases and current prices across every
// location/service type. Aliases are managed on the Aliases page; prices
// come from the Excel import pipeline — this is context, not an edit form.
export function TestDetails({
  aliases,
  prices,
  locationsById,
}: {
  aliases: TestAlias[];
  prices: TestPrice[];
  locationsById: Map<string, Location>;
}) {
  return (
    <div className="flex flex-col gap-3 pt-1">
      <Separator />

      <div>
        <h3 className="text-sm font-medium">Aliases</h3>
        {aliases.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">No aliases configured.</p>
        ) : (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {aliases.map((alias) => (
              <Badge key={alias.id} variant={alias.active ? "secondary" : "outline"}>
                {alias.alias} ({ALIAS_TYPE_LABELS[alias.aliasType]})
              </Badge>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="text-sm font-medium">Current prices</h3>
        {prices.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">Not priced anywhere yet.</p>
        ) : (
          <ul className="mt-1.5 flex flex-col gap-1 text-sm">
            {prices.map((price) => (
              <li key={price.id} className="flex flex-wrap items-center gap-2 text-muted-foreground">
                <span className="font-medium text-foreground">
                  {locationsById.get(price.locationId)?.name ?? price.locationId}
                </span>
                <Badge variant="outline">{SERVICE_TYPE_LABELS[price.serviceType]}</Badge>
                <span>{formatCurrency({ amount: price.price, currency: price.currencyCode })}</span>
                <span>{formatTat(price.tatText)}</span>
                <span>{AVAILABILITY_LABELS[price.availability]}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
