-- ---------------------------------------------------------------------------
-- quote_history: every quotation whose WhatsApp reply an agent copied, so it
-- can be found again and reopened from the History screen.
--
-- Short-lived by design: entries expire 2 days after they're saved. The app
-- never shows an entry older than that, and deletes expired rows whenever
-- history is read or written (lib/database/quote-history.ts) — no scheduled
-- job needed.
--
-- line_items is a snapshot of what was quoted (names, codes, prices at the
-- time). Reopening a quote re-prices it from current test/profile prices;
-- the snapshot is only ever shown as a historical record.
-- ---------------------------------------------------------------------------
create table quote_history (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  location_id uuid not null references locations(id),
  customer_name text,
  line_items jsonb not null,
  currency_code text not null,
  subtotal integer not null check (subtotal >= 0),
  discount_percent integer not null default 0 check (discount_percent between 0 and 100),
  total integer not null check (total >= 0),
  reply_text text not null
);

create index quote_history_created_at_idx on quote_history (created_at desc);

alter table quote_history enable row level security;

create policy quote_history_select on quote_history
  for select using (current_user_role() in ('support', 'admin'));
create policy quote_history_insert on quote_history
  for insert with check (current_user_role() in ('support', 'admin'));
create policy quote_history_admin_all on quote_history
  for all using (current_user_role() = 'admin') with check (current_user_role() = 'admin');
