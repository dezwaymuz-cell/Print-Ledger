-- Print Ledger — Supabase schema (run once in Supabase → SQL Editor)

create table if not exists public.students (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  class_name   text,
  student_code text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);

create table if not exists public.print_entries (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references public.students(id),
  quantity     integer not null check (quantity > 0),
  unit_price   numeric not null check (unit_price >= 0),
  total_amount numeric not null check (total_amount >= 0),
  created_at   timestamptz not null default now()
);

create table if not exists public.payments (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references public.students(id),
  amount       numeric not null check (amount > 0),
  payment_note text,
  status       text not null default 'valid' check (status in ('valid','void')),
  created_at   timestamptz not null default now()
);

-- Small key/value table for Settings (price per portion, currency)
create table if not exists public.settings (
  key   text primary key,
  value text not null
);

insert into public.settings (key, value) values
  ('price_per_portion', '1'),
  ('currency', '₹')
on conflict (key) do nothing;

create index if not exists print_entries_student_idx on public.print_entries(student_id, created_at desc);
create index if not exists payments_student_idx      on public.payments(student_id, created_at desc);

-- Balances per student (charges − valid payments)
create or replace view public.student_balances as
select
  s.id, s.name, s.class_name, s.student_code, s.is_active, s.created_at,
  coalesce(p.total, 0)                       as total_charge,
  coalesce(pay.total, 0)                     as total_paid,
  coalesce(p.total, 0) - coalesce(pay.total, 0) as pending
from public.students s
left join (select student_id, sum(total_amount) total from public.print_entries group by student_id) p
       on p.student_id = s.id
left join (select student_id, sum(amount) total from public.payments where status = 'valid' group by student_id) pay
       on pay.student_id = s.id;

-- Row Level Security.
-- There is no login in this MVP, so the public (anon) key is allowed to read/write.
-- Anyone who has your site URL + anon key can use the data: keep the site URL private,
-- or add Supabase Auth and tighten these policies before sharing widely.
alter table public.students      enable row level security;
alter table public.print_entries enable row level security;
alter table public.payments      enable row level security;
alter table public.settings      enable row level security;

drop policy if exists "open access" on public.students;
drop policy if exists "open access" on public.print_entries;
drop policy if exists "open access" on public.payments;
drop policy if exists "open access" on public.settings;

create policy "open access" on public.students      for all to anon using (true) with check (true);
create policy "open access" on public.print_entries for all to anon using (true) with check (true);
create policy "open access" on public.payments      for all to anon using (true) with check (true);
create policy "open access" on public.settings      for all to anon using (true) with check (true);

grant select on public.student_balances to anon;
