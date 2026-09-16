-- ============================================================
-- KARSA FINANCE SYSTEM — COMPLETE SUPABASE DATABASE
-- Double-entry accounting + operational finance + stock + HPP
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- MASTER ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'finance'
    check (role in ('owner','director','finance','it')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  account_type text not null check (account_type in
    ('asset','liability','equity','revenue','expense','cogs')),
  normal_balance text not null check (normal_balance in ('debit','credit')),
  parent_id uuid references public.accounts(id),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.cash_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  account_type text not null check (account_type in ('cash','bank')),
  account_id uuid references public.accounts(id),
  opening_balance numeric(18,2) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- TRANSACTIONS ----------
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  transaction_no text unique not null,
  transaction_date date not null default current_date,
  source_type text not null,
  description text not null,
  category text not null,
  cash_account_id uuid references public.cash_accounts(id),
  cash_in numeric(18,2) not null default 0,
  cash_out numeric(18,2) not null default 0,
  reference_no text,
  pic text,
  status text not null default 'posted' check (status in ('draft','posted','void')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cash_in >= 0 and cash_out >= 0 and not (cash_in > 0 and cash_out > 0))
);

-- ---------- SALES / PURCHASES ----------
create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  sale_no text unique not null,
  sale_date date not null default current_date,
  customer_name text,
  total numeric(18,2) not null default 0,
  paid numeric(18,2) not null default 0,
  due_date date,
  cash_account_id uuid references public.cash_accounts(id),
  status text not null default 'paid' check (status in ('unpaid','partial','paid','void')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  check (total >= 0 and paid >= 0 and paid <= total)
);

create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  purchase_no text unique not null,
  purchase_date date not null default current_date,
  supplier_name text,
  total numeric(18,2) not null default 0,
  paid numeric(18,2) not null default 0,
  due_date date,
  cash_account_id uuid references public.cash_accounts(id),
  status text not null default 'paid' check (status in ('unpaid','partial','paid','void')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  check (total >= 0 and paid >= 0 and paid <= total)
);

-- ---------- AR/AP ----------
create table if not exists public.accounts_receivable (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  reference_no text,
  invoice_date date not null default current_date,
  amount numeric(18,2) not null default 0,
  paid numeric(18,2) not null default 0,
  due_date date,
  status text not null default 'unpaid' check (status in ('unpaid','partial','paid')),
  created_at timestamptz not null default now(),
  check (amount >= 0 and paid >= 0 and paid <= amount)
);

create table if not exists public.accounts_payable (
  id uuid primary key default gen_random_uuid(),
  supplier_name text not null,
  reference_no text,
  invoice_date date not null default current_date,
  amount numeric(18,2) not null default 0,
  paid numeric(18,2) not null default 0,
  due_date date,
  status text not null default 'unpaid' check (status in ('unpaid','partial','paid')),
  created_at timestamptz not null default now(),
  check (amount >= 0 and paid >= 0 and paid <= amount)
);

create table if not exists public.ar_payments (
  id uuid primary key default gen_random_uuid(),
  ar_id uuid not null references public.accounts_receivable(id) on delete cascade,
  payment_date date not null default current_date,
  amount numeric(18,2) not null,
  cash_account_id uuid references public.cash_accounts(id),
  reference_no text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.ap_payments (
  id uuid primary key default gen_random_uuid(),
  ap_id uuid not null references public.accounts_payable(id) on delete cascade,
  payment_date date not null default current_date,
  amount numeric(18,2) not null,
  cash_account_id uuid references public.cash_accounts(id),
  reference_no text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- ---------- PRODUCTS / STOCK ----------
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  sku text unique not null,
  name text not null,
  size text,
  fabric_type text,
  selling_price numeric(18,2) not null default 0,
  stock_qty numeric(18,3) not null default 0,
  reorder_level numeric(18,3) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  movement_no text unique not null,
  movement_date date not null default current_date,
  product_id uuid not null references public.products(id),
  movement_type text not null check (movement_type in ('in','out','adjustment')),
  qty numeric(18,3) not null,
  unit_cost numeric(18,2) not null default 0,
  source_type text,
  source_id uuid,
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- ---------- HPP ----------
create table if not exists public.product_cost_components (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  component_group text not null check (component_group in ('bahan','produksi','packaging','aksesoris')),
  component_name text not null,
  unit text default 'pcs',
  qty numeric(18,4) not null default 1,
  unit_cost numeric(18,2) not null default 0,
  created_at timestamptz not null default now()
);

create or replace view public.v_product_hpp as
select
  p.id, p.sku, p.name, p.selling_price,
  coalesce(sum(c.qty*c.unit_cost),0)::numeric(18,2) as hpp_per_unit,
  (p.selling_price-coalesce(sum(c.qty*c.unit_cost),0))::numeric(18,2) as estimated_profit,
  case when p.selling_price > 0
    then round(((p.selling_price-coalesce(sum(c.qty*c.unit_cost),0))/p.selling_price*100)::numeric,2)
    else 0 end as margin_percent
from public.products p
left join public.product_cost_components c on c.product_id=p.id
group by p.id;

-- ---------- JOURNAL ----------
create table if not exists public.journal_headers (
  id uuid primary key default gen_random_uuid(),
  journal_no text unique not null,
  journal_date date not null default current_date,
  journal_type text not null check (journal_type in
    ('general','sales','purchase','receipt','payment')),
  source_type text,
  source_id uuid,
  description text not null,
  status text not null default 'posted' check (status in ('draft','posted','void')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.journal_lines (
  id uuid primary key default gen_random_uuid(),
  journal_id uuid not null references public.journal_headers(id) on delete cascade,
  line_no integer not null,
  account_id uuid not null references public.accounts(id),
  description text,
  debit numeric(18,2) not null default 0,
  credit numeric(18,2) not null default 0,
  created_at timestamptz not null default now(),
  check (debit >= 0 and credit >= 0 and not (debit > 0 and credit > 0)),
  unique(journal_id,line_no)
);

create or replace view public.v_journal_balance as
select
  h.id,h.journal_no,h.journal_date,h.journal_type,h.source_type,h.source_id,
  h.description,h.status,
  coalesce(sum(l.debit),0)::numeric(18,2) total_debit,
  coalesce(sum(l.credit),0)::numeric(18,2) total_credit,
  (coalesce(sum(l.debit),0)-coalesce(sum(l.credit),0))::numeric(18,2) difference
from public.journal_headers h
left join public.journal_lines l on l.journal_id=h.id
group by h.id;

-- ---------- AUDIT ----------
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  action text not null,
  table_name text,
  record_id uuid,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

-- ---------- SEED CHART OF ACCOUNTS ----------
insert into public.accounts(code,name,account_type,normal_balance) values
('1100','Kas','asset','debit'),
('1200','Bank','asset','debit'),
('1300','Piutang Usaha','asset','debit'),
('1400','Persediaan','asset','debit'),
('2100','Hutang Usaha','liability','credit'),
('3100','Modal Pemilik','equity','credit'),
('3200','Prive / Penarikan Pemilik','equity','debit'),
('4100','Penjualan','revenue','credit'),
('4200','Pendapatan Lain','revenue','credit'),
('5100','HPP','cogs','debit'),
('6100','Beban Operasional','expense','debit'),
('6200','Beban Administrasi','expense','debit'),
('6300','Beban Lain','expense','debit')
on conflict(code) do nothing;

-- ---------- VIEWS FOR REPORTING ----------
create or replace view public.v_cash_flow as
select
  t.transaction_date,
  coalesce(c.name,'-') cash_account,
  t.transaction_no,t.description,t.source_type,
  t.cash_in,t.cash_out,
  (t.cash_in-t.cash_out) net_cash
from public.transactions t
left join public.cash_accounts c on c.id=t.cash_account_id
where t.status='posted';

create or replace view public.v_profit_loss as
select
  coalesce(sum(case when a.account_type='revenue' then l.credit-l.debit else 0 end),0) revenue,
  coalesce(sum(case when a.account_type='cogs' then l.debit-l.credit else 0 end),0) cogs,
  coalesce(sum(case when a.account_type='expense' then l.debit-l.credit else 0 end),0) expenses
from public.journal_headers h
join public.journal_lines l on l.journal_id=h.id
join public.accounts a on a.id=l.account_id
where h.status='posted';

-- ---------- RLS ----------
do $$ declare t text;
begin
  foreach t in array array[
    'profiles','accounts','cash_accounts','transactions','sales','purchases',
    'accounts_receivable','accounts_payable','ar_payments','ap_payments',
    'products','stock_movements','product_cost_components',
    'journal_headers','journal_lines','audit_logs'
  ]
  loop
    execute format('alter table public.%I enable row level security',t);
    execute format('drop policy if exists "auth select" on public.%I',t);
    execute format('create policy "auth select" on public.%I for select to authenticated using (true)',t);
  end loop;
end $$;

-- Basic authenticated inserts; production role policies can be tightened later.
do $$ declare t text;
begin
  foreach t in array array[
    'transactions','sales','purchases','accounts_receivable','accounts_payable',
    'ar_payments','ap_payments','products','stock_movements',
    'product_cost_components','journal_headers','journal_lines'
  ]
  loop
    execute format('drop policy if exists "auth insert" on public.%I',t);
    execute format('create policy "auth insert" on public.%I for insert to authenticated with check (true)',t);
  end loop;
end $$;

-- Profile trigger for Auth users.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  insert into public.profiles(id,full_name)
  values(new.id,coalesce(new.raw_user_meta_data->>'full_name',new.email))
  on conflict(id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

-- ---------- ACCOUNTING RULES / FORMULAS ----------
-- Sales paid:       Dr Kas/Bank, Cr Penjualan
-- Sales credit:     Dr Piutang, Cr Penjualan
-- Purchase paid:    Dr Persediaan/HPP, Cr Kas/Bank
-- Purchase credit:  Dr Persediaan/HPP, Cr Hutang
-- Other receipt:    Dr Kas/Bank, Cr Pendapatan Lain
-- Expense payment:  Dr Beban, Cr Kas/Bank
-- Capital in:       Dr Kas/Bank, Cr Modal
-- Owner withdrawal: Dr Prive, Cr Kas/Bank
-- AR collection:    Dr Kas/Bank, Cr Piutang
-- AP payment:       Dr Hutang, Cr Kas/Bank
-- Sale inventory cost: Dr HPP, Cr Persediaan
-- Ending stock: Beginning + Stock In - Stock Out +/- Adjustments
-- HPP/unit: SUM(qty_component * unit_cost)
-- Gross profit: Sales - HPP
-- Net profit: Gross profit - operating expenses
