// Empty state for the quotation column before any test is added.
export function EmptyWorkspace() {
  return (
    <div className="flex max-w-[340px] flex-col gap-2 pt-10">
      <span className="grid size-[52px] place-items-center rounded-[18px] bg-accent text-[22px]">🧾</span>
      <p className="mt-2 text-[17px] font-medium">Nothing added yet</p>
      <p className="text-[14.5px] leading-relaxed text-muted-foreground">
        Add tests on the left and they appear here with the running total and a ready-to-send reply.
      </p>
    </div>
  );
}
