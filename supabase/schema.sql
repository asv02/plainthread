-- Plain Thread commerce schema.
-- Apply in Supabase: SQL Editor → New query → paste this file → Run.
-- Or from the repo: set SUPABASE_ACCESS_TOKEN then `npm run db:apply`
-- Then verify: `npm run db:verify`
--
-- Tables: variants, orders, order_items, payment_events, users, customer_sessions
-- RPCs: checkout_create, attach_razorpay_order, mark_order_paid, confirm_cod_order,
--       cancel_customer_order, finalize_refund_cancel, expire_stale_orders,
--       admin_set_parcel, admin_set_payment, ...

create extension if not exists pgcrypto;

create table if not exists public.variants (
  id uuid primary key default gen_random_uuid(),
  product_slug text not null,
  size text not null,
  sku text not null unique,
  stock integer not null default 0 check (stock >= 0),
  created_at timestamptz not null default now(),
  unique (product_slug, size)
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique,
  access_token text not null unique,
  idempotency_key text not null,
  status text not null default 'open'
    check (status in ('open', 'cancelled')),
  payment_method text
    check (payment_method is null or payment_method in ('prepaid', 'cod')),
  parcel_status text not null default 'pending'
    check (parcel_status in ('pending', 'shipped', 'delivered', 'returned')),
  customer_name text not null,
  email text not null,
  phone text not null,
  address_line1 text not null,
  address_line2 text,
  city text not null,
  state text not null,
  pincode text not null,
  subtotal_paise integer not null,
  tax_paise integer not null default 0,
  tax_rate_bps integer not null default 0,
  tax_kind text not null default 'igst',
  cgst_paise integer not null default 0,
  sgst_paise integer not null default 0,
  igst_paise integer not null default 0,
  shipping_paise integer not null,
  total_paise integer not null,
  currency text not null default 'INR',
  razorpay_order_id text unique,
  razorpay_payment_id text unique,
  payment_status text not null default 'pending_payment'
    check (payment_status in (
      'pending_payment',
      'paid',
      'refund_pending',
      'refunded'
    )),
  failure_reason text,
  hold_expires_at timestamptz not null,
  cancelled_at timestamptz,
  cancel_reason text,
  paid_at timestamptz,
  customer_email_sent_at timestamptz,
  ops_email_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.orders add column if not exists tax_paise integer not null default 0;
alter table public.orders add column if not exists tax_rate_bps integer not null default 0;
alter table public.orders add column if not exists tax_kind text not null default 'igst';
alter table public.orders add column if not exists cgst_paise integer not null default 0;
alter table public.orders add column if not exists sgst_paise integer not null default 0;
alter table public.orders add column if not exists igst_paise integer not null default 0;
alter table public.orders add column if not exists customer_email_sent_at timestamptz;
alter table public.orders add column if not exists ops_email_sent_at timestamptz;
alter table public.orders add column if not exists payment_method text;
alter table public.orders add column if not exists parcel_status text;

alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders drop constraint if exists orders_payment_status_check;
alter table public.orders drop constraint if exists orders_payment_method_check;
alter table public.orders drop constraint if exists orders_parcel_status_check;

update public.orders
set payment_status = 'pending_payment'
where payment_status in ('created', 'failed');

update public.orders
set
  payment_method = case
    when payment_method in ('prepaid', 'cod') then payment_method
    when payment_status in ('paid', 'refund_pending', 'refunded') then 'prepaid'
    when status in ('paid', 'packed', 'shipped', 'delivered') then 'prepaid'
    else payment_method
  end,
  parcel_status = case
    when parcel_status in ('pending', 'shipped', 'delivered', 'returned') then parcel_status
    when status = 'shipped' then 'shipped'
    when status = 'delivered' then 'delivered'
    else 'pending'
  end,
  status = case
    when status = 'cancelled' then 'cancelled'
    else 'open'
  end;

alter table public.orders alter column status set default 'open';
alter table public.orders alter column payment_status set default 'pending_payment';
alter table public.orders alter column parcel_status set default 'pending';
alter table public.orders alter column parcel_status set not null;

alter table public.orders add constraint orders_status_check
  check (status in ('open', 'cancelled'));
alter table public.orders add constraint orders_payment_status_check
  check (payment_status in ('pending_payment', 'paid', 'refund_pending', 'refunded'));
alter table public.orders add constraint orders_payment_method_check
  check (payment_method is null or payment_method in ('prepaid', 'cod'));
alter table public.orders add constraint orders_parcel_status_check
  check (parcel_status in ('pending', 'shipped', 'delivered', 'returned'));

drop index if exists orders_idempotency_active;
create unique index if not exists orders_idempotency_active
  on public.orders (idempotency_key)
  where status = 'open';

drop index if exists orders_status_hold_idx;
create index if not exists orders_status_hold_idx
  on public.orders (status, payment_method, hold_expires_at);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  variant_id uuid not null references public.variants(id),
  product_slug text not null,
  size text not null,
  sku text not null,
  name text not null,
  qty integer not null check (qty > 0),
  unit_price_paise integer not null,
  stock_held boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete set null,
  event_type text not null,
  provider_event_id text unique,
  payload jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.checkout_otps (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('email', 'phone')),
  destination text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists checkout_otps_destination_idx
  on public.checkout_otps (channel, destination, created_at desc);

create table if not exists public.checkout_verify_sessions (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  email text,
  phone text,
  email_verified boolean not null default false,
  phone_verified boolean not null default false,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  phone text,
  name text,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customer_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  token text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists customer_sessions_user_idx
  on public.customer_sessions (user_id, expires_at desc);

alter table public.orders add column if not exists user_id uuid references public.users(id);
create index if not exists orders_user_id_idx on public.orders (user_id);
create index if not exists orders_email_idx on public.orders (email);

alter table public.variants add column if not exists created_at timestamptz not null default now();
alter table public.order_items add column if not exists created_at timestamptz not null default now();
alter table public.orders add column if not exists created_at timestamptz not null default now();
alter table public.payment_events add column if not exists created_at timestamptz not null default now();

alter table public.variants enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payment_events enable row level security;
alter table public.checkout_otps enable row level security;
alter table public.checkout_verify_sessions enable row level security;
alter table public.users enable row level security;
alter table public.customer_sessions enable row level security;

-- Anon has no policies: all commerce goes through the Next.js service role.

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists orders_touch_updated_at on public.orders;
create trigger orders_touch_updated_at
  before update on public.orders
  for each row execute function public.touch_updated_at();

drop trigger if exists users_touch_updated_at on public.users;
create trigger users_touch_updated_at
  before update on public.users
  for each row execute function public.touch_updated_at();

create or replace function public.upsert_customer(
  p_email text,
  p_phone text default null,
  p_name text default null
) returns uuid
language plpgsql
as $$
declare
  v_email text;
  v_id uuid;
begin
  v_email := lower(trim(coalesce(p_email, '')));
  if v_email = '' or position('@' in v_email) = 0 then
    raise exception 'INVALID_EMAIL';
  end if;

  insert into public.users (email, phone, name)
  values (
    v_email,
    nullif(trim(coalesce(p_phone, '')), ''),
    nullif(trim(coalesce(p_name, '')), '')
  )
  on conflict (email) do update
  set
    phone = coalesce(excluded.phone, public.users.phone),
    name = coalesce(excluded.name, public.users.name),
    updated_at = now()
  returning id into v_id;

  update public.orders
  set user_id = v_id
  where user_id is null
    and lower(email) = v_email;

  return v_id;
end;
$$;

insert into public.users (email, phone, name)
select distinct on (lower(o.email))
  lower(o.email),
  o.phone,
  o.customer_name
from public.orders o
where o.email is not null and length(trim(o.email)) > 3
order by lower(o.email), o.created_at desc
on conflict (email) do nothing;

update public.orders o
set user_id = u.id
from public.users u
where o.user_id is null
  and lower(o.email) = u.email;

create or replace function public.restock_order_items(p_order_id uuid)
returns void
language plpgsql
as $$
declare
  r record;
begin
  for r in
    select id, variant_id, qty
    from public.order_items
    where order_id = p_order_id and stock_held = true
    for update
  loop
    update public.variants
    set stock = stock + r.qty
    where id = r.variant_id;
    update public.order_items
    set stock_held = false
    where id = r.id;
  end loop;
end;
$$;

create or replace function public.restock_and_cancel(p_order_id uuid, p_reason text)
returns boolean
language plpgsql
as $$
declare
  updated_id uuid;
begin
  update public.orders
  set
    status = 'cancelled',
    cancel_reason = p_reason,
    cancelled_at = now()
  where id = p_order_id
    and status = 'open'
    and parcel_status = 'pending'
    and payment_status = 'pending_payment'
  returning id into updated_id;

  if updated_id is null then
    return false;
  end if;

  perform public.restock_order_items(p_order_id);
  return true;
end;
$$;

drop function if exists public.expire_stale_orders();
drop function if exists public.expire_stale_orders(uuid);

create or replace function public.expire_stale_orders(p_exclude_id uuid default null)
returns integer
language plpgsql
as $$
declare
  n integer := 0;
  oid uuid;
begin
  for oid in
    select id
    from public.orders
    where status = 'open'
      and payment_method is null
      and payment_status = 'pending_payment'
      and parcel_status = 'pending'
      and hold_expires_at < now()
      and (p_exclude_id is null or id <> p_exclude_id)
    for update skip locked
  loop
    if public.restock_and_cancel(oid, 'hold_expired') then
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;

create or replace function public.order_payload(p_order_id uuid)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'order', to_jsonb(o.*),
    'items', coalesce((
      select jsonb_agg(to_jsonb(i.*) order by i.name, i.size)
      from public.order_items i
      where i.order_id = o.id
    ), '[]'::jsonb)
  )
  from public.orders o
  where o.id = p_order_id;
$$;

drop function if exists public.checkout_create(text, jsonb, jsonb, integer, integer, integer);
drop function if exists public.checkout_create(text, jsonb, jsonb, integer, integer, integer, integer, integer, text, integer, integer, integer);
drop function if exists public.checkout_create(text, jsonb, jsonb, integer, integer, integer, integer, integer, integer, text, integer, integer, integer);

create or replace function public.checkout_create(
  p_idempotency_key text,
  p_customer jsonb,
  p_items jsonb,
  p_subtotal_paise integer,
  p_tax_paise integer,
  p_shipping_paise integer,
  p_total_paise integer,
  p_hold_minutes integer,
  p_tax_rate_bps integer,
  p_tax_kind text,
  p_cgst_paise integer,
  p_sgst_paise integer,
  p_igst_paise integer
)
returns jsonb
language plpgsql
as $$
declare
  existing_id uuid;
  new_id uuid;
  v_user_id uuid;
  item jsonb;
  v_id uuid;
  v_sku text;
  v_stock integer;
  qty integer;
begin
  perform public.expire_stale_orders();

  if p_idempotency_key is null or length(p_idempotency_key) < 8 then
    raise exception 'INVALID_IDEMPOTENCY';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 then
    raise exception 'EMPTY_CART';
  end if;

  v_user_id := public.upsert_customer(
    p_customer->>'email',
    p_customer->>'phone',
    p_customer->>'name'
  );

  select o.id into existing_id
  from public.orders o
  where o.idempotency_key = p_idempotency_key
    and o.status = 'open'
  limit 1;

  if existing_id is not null then
    update public.orders
    set
      customer_name = coalesce(p_customer->>'name', customer_name),
      email = coalesce(lower(p_customer->>'email'), email),
      phone = coalesce(p_customer->>'phone', phone),
      address_line1 = coalesce(p_customer->>'address_line1', address_line1),
      address_line2 = nullif(p_customer->>'address_line2', ''),
      city = coalesce(p_customer->>'city', city),
      state = coalesce(p_customer->>'state', state),
      pincode = coalesce(p_customer->>'pincode', pincode),
      user_id = coalesce(user_id, v_user_id)
    where id = existing_id
      and status = 'open'
      and payment_method is null;
    return public.order_payload(existing_id);
  end if;

  -- Lock variants in id order to avoid deadlocks on concurrent checkouts.
  for item in
    select elem
    from jsonb_array_elements(p_items) as elem
    join public.variants v
      on v.product_slug = elem->>'product_slug'
     and v.size = elem->>'size'
    order by v.id
  loop
    qty := (item->>'qty')::integer;
    if qty is null or qty < 1 or qty > 5 then
      raise exception 'INVALID_QTY';
    end if;

    select id, sku, stock into v_id, v_sku, v_stock
    from public.variants
    where product_slug = item->>'product_slug'
      and size = item->>'size'
    for update;

    if v_id is null then
      raise exception 'UNKNOWN_VARIANT';
    end if;

    if v_stock < qty then
      raise exception 'OUT_OF_STOCK:%', item->>'product_slug' || ':' || (item->>'size');
    end if;

    update public.variants
    set stock = stock - qty
    where id = v_id;
  end loop;

  insert into public.orders (
    public_id,
    access_token,
    idempotency_key,
    customer_name,
    email,
    phone,
    address_line1,
    address_line2,
    city,
    state,
    pincode,
    subtotal_paise,
    tax_paise,
    tax_rate_bps,
    tax_kind,
    cgst_paise,
    sgst_paise,
    igst_paise,
    shipping_paise,
    total_paise,
    hold_expires_at,
    user_id
  ) values (
    'PT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
    encode(gen_random_bytes(24), 'hex'),
    p_idempotency_key,
    p_customer->>'name',
    lower(p_customer->>'email'),
    p_customer->>'phone',
    p_customer->>'address_line1',
    nullif(p_customer->>'address_line2', ''),
    p_customer->>'city',
    p_customer->>'state',
    p_customer->>'pincode',
    p_subtotal_paise,
    coalesce(p_tax_paise, 0),
    coalesce(p_tax_rate_bps, 0),
    coalesce(nullif(p_tax_kind, ''), 'igst'),
    coalesce(p_cgst_paise, 0),
    coalesce(p_sgst_paise, 0),
    coalesce(p_igst_paise, 0),
    p_shipping_paise,
    p_total_paise,
    now() + make_interval(mins => greatest(2, least(coalesce(p_hold_minutes, 2), 60))),
    v_user_id
  )
  returning id into new_id;

  insert into public.order_items (
    order_id, variant_id, product_slug, size, sku, name, qty, unit_price_paise, stock_held
  )
  select
    new_id,
    v.id,
    line_item->>'product_slug',
    line_item->>'size',
    v.sku,
    line_item->>'name',
    (line_item->>'qty')::integer,
    (line_item->>'unit_price_paise')::integer,
    true
  from jsonb_array_elements(p_items) as line_item
  join public.variants v
    on v.product_slug = line_item->>'product_slug'
   and v.size = line_item->>'size';

  return public.order_payload(new_id);
exception
  when unique_violation then
    select o.id into existing_id
    from public.orders o
    where o.idempotency_key = p_idempotency_key
      and o.status = 'open'
    limit 1;
    if existing_id is null then
      raise;
    end if;
    update public.orders
    set
      customer_name = coalesce(p_customer->>'name', customer_name),
      email = coalesce(lower(p_customer->>'email'), email),
      phone = coalesce(p_customer->>'phone', phone),
      address_line1 = coalesce(p_customer->>'address_line1', address_line1),
      address_line2 = nullif(p_customer->>'address_line2', ''),
      city = coalesce(p_customer->>'city', city),
      state = coalesce(p_customer->>'state', state),
      pincode = coalesce(p_customer->>'pincode', pincode),
      user_id = coalesce(user_id, v_user_id)
    where id = existing_id
      and status = 'open'
      and payment_method is null;
    return public.order_payload(existing_id);
end;
$$;

create or replace function public.attach_razorpay_order(
  p_order_id uuid,
  p_razorpay_order_id text
)
returns void
language plpgsql
as $$
begin
  update public.orders
  set razorpay_order_id = coalesce(razorpay_order_id, p_razorpay_order_id)
  where id = p_order_id
    and status = 'open'
    and payment_method is null;
end;
$$;

create or replace function public.mark_payment_failed(
  p_order_id uuid,
  p_reason text
)
returns void
language plpgsql
as $$
begin
  update public.orders
  set failure_reason = p_reason
  where id = p_order_id
    and status = 'open'
    and payment_method is null
    and payment_status <> 'paid';
end;
$$;

create or replace function public.mark_order_paid(
  p_order_id uuid,
  p_payment_id text
)
returns jsonb
language plpgsql
as $$
declare
  s text;
  method text;
  pay_status text;
  parcel text;
  existing_payment text;
begin
  perform public.expire_stale_orders(p_order_id);

  select status, payment_method, payment_status, parcel_status, razorpay_payment_id
    into s, method, pay_status, parcel, existing_payment
  from public.orders
  where id = p_order_id
  for update;

  if s is null then
    return jsonb_build_object('result', 'not_found');
  end if;

  if pay_status = 'paid' then
    return jsonb_build_object(
      'result', 'already_paid',
      'razorpay_payment_id', existing_payment,
      'payload', public.order_payload(p_order_id)
    );
  end if;

  if s = 'cancelled' then
    if pay_status <> 'refunded' then
      update public.orders
      set
        razorpay_payment_id = coalesce(razorpay_payment_id, p_payment_id),
        payment_status = 'refund_pending',
        failure_reason = coalesce(failure_reason, 'late_payment')
      where id = p_order_id;
    end if;
    return jsonb_build_object('result', 'late_payment', 'payload', public.order_payload(p_order_id));
  end if;

  if method = 'cod' then
    return jsonb_build_object('result', 'invalid_state', 'payload', public.order_payload(p_order_id));
  end if;

  if s <> 'open' or pay_status <> 'pending_payment' then
    return jsonb_build_object('result', 'invalid_state', 'payload', public.order_payload(p_order_id));
  end if;

  update public.orders
  set
    payment_method = 'prepaid',
    payment_status = 'paid',
    razorpay_payment_id = coalesce(p_payment_id, razorpay_payment_id),
    paid_at = now(),
    failure_reason = null
  where id = p_order_id;

  return jsonb_build_object('result', 'paid', 'payload', public.order_payload(p_order_id));
end;
$$;

create or replace function public.confirm_cod_order(
  p_order_id uuid,
  p_payment_id text
)
returns jsonb
language plpgsql
as $$
declare
  s text;
  method text;
  pay_status text;
begin
  perform public.expire_stale_orders(p_order_id);

  select status, payment_method, payment_status
    into s, method, pay_status
  from public.orders
  where id = p_order_id
  for update;

  if s is null then
    return jsonb_build_object('result', 'not_found');
  end if;

  if s = 'cancelled' then
    return jsonb_build_object('result', 'late_cod', 'payload', public.order_payload(p_order_id));
  end if;

  if method = 'cod' then
    return jsonb_build_object('result', 'already_cod', 'payload', public.order_payload(p_order_id));
  end if;

  if pay_status = 'paid' or method = 'prepaid' then
    return jsonb_build_object('result', 'already_paid', 'payload', public.order_payload(p_order_id));
  end if;

  if s <> 'open' or pay_status <> 'pending_payment' then
    return jsonb_build_object('result', 'invalid_state', 'payload', public.order_payload(p_order_id));
  end if;

  update public.orders
  set
    payment_method = 'cod',
    payment_status = 'pending_payment',
    razorpay_payment_id = coalesce(nullif(p_payment_id, ''), razorpay_payment_id),
    failure_reason = null
  where id = p_order_id;

  return jsonb_build_object('result', 'cod_confirmed', 'payload', public.order_payload(p_order_id));
end;
$$;

create or replace function public.cancel_customer_order(p_order_id uuid, p_reason text)
returns jsonb
language plpgsql
as $$
declare
  s text;
  method text;
  pay_status text;
  parcel text;
  payment_id text;
begin
  perform public.expire_stale_orders();

  select status, payment_method, payment_status, parcel_status, razorpay_payment_id
  into s, method, pay_status, parcel, payment_id
  from public.orders
  where id = p_order_id
  for update;

  if s is null then
    return jsonb_build_object('result', 'not_found');
  end if;

  if s = 'cancelled' then
    return jsonb_build_object('result', 'already_cancelled', 'payload', public.order_payload(p_order_id));
  end if;

  if s <> 'open' or parcel <> 'pending' then
    return jsonb_build_object('result', 'not_cancellable', 'status', s, 'payload', public.order_payload(p_order_id));
  end if;

  if pay_status = 'paid' or pay_status = 'refund_pending' then
    update public.orders
    set payment_status = 'refund_pending', cancel_reason = coalesce(p_reason, 'customer_cancelled')
    where id = p_order_id;
    return jsonb_build_object(
      'result', 'needs_refund',
      'razorpay_payment_id', payment_id,
      'payload', public.order_payload(p_order_id)
    );
  end if;

  perform public.restock_and_cancel(p_order_id, coalesce(p_reason, 'customer_cancelled'));
  return jsonb_build_object('result', 'cancelled_pending', 'payload', public.order_payload(p_order_id));
end;
$$;

create or replace function public.finalize_refund_cancel(p_order_id uuid)
returns jsonb
language plpgsql
as $$
declare
  s text;
  pay_status text;
  parcel text;
begin
  select status, payment_status, parcel_status into s, pay_status, parcel
  from public.orders
  where id = p_order_id
  for update;

  if s = 'cancelled' then
    if pay_status = 'refund_pending' then
      update public.orders
      set payment_status = 'refunded', failure_reason = null
      where id = p_order_id;
      return jsonb_build_object('result', 'refunded', 'payload', public.order_payload(p_order_id));
    end if;
    return jsonb_build_object('result', 'already_cancelled', 'payload', public.order_payload(p_order_id));
  end if;

  if s <> 'open' or parcel <> 'pending' or pay_status <> 'refund_pending' then
    return jsonb_build_object('result', 'invalid_state', 'status', s);
  end if;

  update public.orders
  set
    status = 'cancelled',
    payment_status = 'refunded',
    cancelled_at = now()
  where id = p_order_id;

  perform public.restock_order_items(p_order_id);

  return jsonb_build_object('result', 'refunded', 'payload', public.order_payload(p_order_id));
end;
$$;

create or replace function public.admin_set_parcel(p_order_id uuid, p_parcel text)
returns jsonb
language plpgsql
as $$
declare
  s text;
  method text;
  parcel text;
begin
  if p_parcel not in ('shipped', 'delivered', 'returned') then
    raise exception 'INVALID_STATUS';
  end if;

  select status, payment_method, parcel_status
    into s, method, parcel
  from public.orders
  where id = p_order_id
  for update;

  if s is null then
    return jsonb_build_object('result', 'not_found');
  end if;

  if s = 'cancelled' then
    return jsonb_build_object('result', 'not_cancellable');
  end if;

  if method is null then
    raise exception 'INVALID_TRANSITION';
  end if;

  if p_parcel = 'shipped' and parcel <> 'pending' then
    raise exception 'INVALID_TRANSITION';
  end if;
  if p_parcel = 'delivered' and parcel <> 'shipped' then
    raise exception 'INVALID_TRANSITION';
  end if;
  if p_parcel = 'returned' and parcel not in ('shipped', 'delivered') then
    raise exception 'INVALID_TRANSITION';
  end if;

  update public.orders set parcel_status = p_parcel where id = p_order_id;

  if p_parcel = 'returned' then
    perform public.restock_order_items(p_order_id);
  end if;

  return public.order_payload(p_order_id);
end;
$$;

create or replace function public.admin_set_payment(p_order_id uuid, p_payment text)
returns jsonb
language plpgsql
as $$
declare
  s text;
  method text;
  pay_status text;
  parcel text;
begin
  if p_payment not in ('paid', 'refunded') then
    raise exception 'INVALID_STATUS';
  end if;

  select status, payment_method, payment_status, parcel_status
    into s, method, pay_status, parcel
  from public.orders
  where id = p_order_id
  for update;

  if s is null then
    return jsonb_build_object('result', 'not_found');
  end if;

  if s = 'cancelled' then
    return jsonb_build_object('result', 'not_cancellable');
  end if;

  if p_payment = 'paid' then
    if method <> 'cod' or pay_status <> 'pending_payment' then
      raise exception 'INVALID_TRANSITION';
    end if;
    update public.orders
    set payment_status = 'paid', paid_at = now(), failure_reason = null
    where id = p_order_id;
    return public.order_payload(p_order_id);
  end if;

  if method <> 'prepaid' or parcel <> 'returned' or pay_status not in ('paid', 'refund_pending') then
    raise exception 'INVALID_TRANSITION';
  end if;

  update public.orders
  set payment_status = 'refunded'
  where id = p_order_id;

  return public.order_payload(p_order_id);
end;
$$;

-- Legacy admin name: packed is no longer a parcel state.
create or replace function public.admin_set_status(p_order_id uuid, p_status text)
returns jsonb
language plpgsql
as $$
begin
  if p_status = 'packed' then
    raise exception 'INVALID_STATUS';
  end if;
  return public.admin_set_parcel(p_order_id, p_status);
end;
$$;

-- Seed only missing catalog rows. An existing variant (same product + size, or same sku)
-- is skipped, so maintained sku and stock are left unchanged.
insert into public.variants (product_slug, size, sku, stock)
select seed.product_slug, seed.size, seed.sku, seed.stock
from (
  values
    ('black-oversized-tshirt', 'S', 'PT-OTS-001-JB-S', 20),
    ('black-oversized-tshirt', 'M', 'PT-OTS-001-JB-M', 20),
    ('black-oversized-tshirt', 'L', 'PT-OTS-001-JB-L', 20),
    ('black-oversized-tshirt', 'XL', 'PT-OTS-001-JB-XL', 20),
    ('black-oversized-tshirt', 'XXL', 'PT-OTS-001-JB-XXL', 20),
    ('white-oversized-tshirt', 'S', 'PT-OTS-001-SW-S', 20),
    ('white-oversized-tshirt', 'M', 'PT-OTS-001-SW-M', 20),
    ('white-oversized-tshirt', 'L', 'PT-OTS-001-SW-L', 20),
    ('white-oversized-tshirt', 'XL', 'PT-OTS-001-SW-XL', 20),
    ('white-oversized-tshirt', 'XXL', 'PT-OTS-001-SW-XXL', 20),
    ('pink-oversized-tshirt', 'S', 'PT-OTS-001-RP-S', 20),
    ('pink-oversized-tshirt', 'M', 'PT-OTS-001-RP-M', 20),
    ('pink-oversized-tshirt', 'L', 'PT-OTS-001-RP-L', 20),
    ('pink-oversized-tshirt', 'XL', 'PT-OTS-001-RP-XL', 20),
    ('pink-oversized-tshirt', 'XXL', 'PT-OTS-001-RP-XXL', 20)
) as seed(product_slug, size, sku, stock)
where not exists (
  select 1
  from public.variants existing
  where existing.product_slug = seed.product_slug
    and existing.size = seed.size
)
and not exists (
  select 1
  from public.variants existing
  where existing.sku = seed.sku
);

revoke all on public.variants from anon, authenticated;
revoke all on public.orders from anon, authenticated;
revoke all on public.order_items from anon, authenticated;
revoke all on public.payment_events from anon, authenticated;
revoke all on public.checkout_otps from anon, authenticated;
revoke all on public.checkout_verify_sessions from anon, authenticated;
revoke all on public.users from anon, authenticated;
revoke all on public.customer_sessions from anon, authenticated;

revoke all on function public.checkout_create(text, jsonb, jsonb, integer, integer, integer, integer, integer, integer, text, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.attach_razorpay_order(uuid, text) from public, anon, authenticated;
revoke all on function public.mark_payment_failed(uuid, text) from public, anon, authenticated;
revoke all on function public.mark_order_paid(uuid, text) from public, anon, authenticated;
revoke all on function public.confirm_cod_order(uuid, text) from public, anon, authenticated;
revoke all on function public.cancel_customer_order(uuid, text) from public, anon, authenticated;
revoke all on function public.finalize_refund_cancel(uuid) from public, anon, authenticated;
revoke all on function public.expire_stale_orders(uuid) from public, anon, authenticated;
revoke all on function public.admin_set_status(uuid, text) from public, anon, authenticated;
revoke all on function public.admin_set_parcel(uuid, text) from public, anon, authenticated;
revoke all on function public.admin_set_payment(uuid, text) from public, anon, authenticated;
revoke all on function public.order_payload(uuid) from public, anon, authenticated;
revoke all on function public.restock_order_items(uuid) from public, anon, authenticated;
revoke all on function public.restock_and_cancel(uuid, text) from public, anon, authenticated;
revoke all on function public.upsert_customer(text, text, text) from public, anon, authenticated;

grant execute on function public.checkout_create(text, jsonb, jsonb, integer, integer, integer, integer, integer, integer, text, integer, integer, integer) to service_role;
grant execute on function public.attach_razorpay_order(uuid, text) to service_role;
grant execute on function public.mark_payment_failed(uuid, text) to service_role;
grant execute on function public.mark_order_paid(uuid, text) to service_role;
grant execute on function public.confirm_cod_order(uuid, text) to service_role;
grant execute on function public.cancel_customer_order(uuid, text) to service_role;
grant execute on function public.finalize_refund_cancel(uuid) to service_role;
grant execute on function public.expire_stale_orders(uuid) to service_role;
grant execute on function public.admin_set_status(uuid, text) to service_role;
grant execute on function public.admin_set_parcel(uuid, text) to service_role;
grant execute on function public.admin_set_payment(uuid, text) to service_role;
grant execute on function public.order_payload(uuid) to service_role;
grant execute on function public.upsert_customer(text, text, text) to service_role;

-- Meta Pixel / CAPI attribution and durable Purchase outbox.
alter table public.orders add column if not exists meta_fbp text;
alter table public.orders add column if not exists meta_fbc text;
alter table public.orders add column if not exists meta_client_ip_address text;
alter table public.orders add column if not exists meta_client_user_agent text;
alter table public.orders add column if not exists marketing_consent boolean;
alter table public.orders add column if not exists marketing_consent_at timestamptz;
alter table public.orders add column if not exists marketing_consent_source text;

create table if not exists public.meta_event_outbox (
  id uuid primary key default gen_random_uuid(),
  event_name text not null,
  event_id text not null,
  order_id uuid not null references public.orders(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'sent', 'retry', 'dead_letter')),
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_http_status integer,
  last_error_code text,
  client_ip_address text,
  client_user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (event_name, event_id)
);

create index if not exists meta_event_outbox_claim_idx
  on public.meta_event_outbox (status, next_attempt_at);

alter table public.meta_event_outbox enable row level security;
revoke all on public.meta_event_outbox from anon, authenticated;

create or replace function public.enqueue_meta_purchase(p_order_id uuid)
returns void
language plpgsql
as $$
declare
  o public.orders%rowtype;
begin
  select * into o from public.orders where id = p_order_id;
  if o.id is null then
    return;
  end if;
  if o.status <> 'open' or o.payment_status <> 'paid' or o.payment_method <> 'prepaid' then
    return;
  end if;
  if coalesce(o.marketing_consent, false) is not true then
    return;
  end if;
  if o.razorpay_payment_id is not null and o.razorpay_payment_id like 'sim_%' then
    return;
  end if;

  insert into public.meta_event_outbox (
    event_name,
    event_id,
    order_id,
    status,
    next_attempt_at,
    client_ip_address,
    client_user_agent
  ) values (
    'Purchase',
    'purchase_' || o.public_id,
    o.id,
    'pending',
    now(),
    o.meta_client_ip_address,
    o.meta_client_user_agent
  )
  on conflict (event_name, event_id) do nothing;
end;
$$;

create or replace function public.mark_order_paid(
  p_order_id uuid,
  p_payment_id text
)
returns jsonb
language plpgsql
as $$
declare
  s text;
  method text;
  pay_status text;
  parcel text;
  existing_payment text;
begin
  perform public.expire_stale_orders(p_order_id);

  select status, payment_method, payment_status, parcel_status, razorpay_payment_id
    into s, method, pay_status, parcel, existing_payment
  from public.orders
  where id = p_order_id
  for update;

  if s is null then
    return jsonb_build_object('result', 'not_found');
  end if;

  if pay_status = 'paid' then
    perform public.enqueue_meta_purchase(p_order_id);
    return jsonb_build_object(
      'result', 'already_paid',
      'razorpay_payment_id', existing_payment,
      'payload', public.order_payload(p_order_id)
    );
  end if;

  if s = 'cancelled' then
    if pay_status <> 'refunded' then
      update public.orders
      set
        razorpay_payment_id = coalesce(razorpay_payment_id, p_payment_id),
        payment_status = 'refund_pending',
        failure_reason = coalesce(failure_reason, 'late_payment')
      where id = p_order_id;
    end if;
    return jsonb_build_object('result', 'late_payment', 'payload', public.order_payload(p_order_id));
  end if;

  if method = 'cod' then
    return jsonb_build_object('result', 'invalid_state', 'payload', public.order_payload(p_order_id));
  end if;

  if s <> 'open' or pay_status <> 'pending_payment' then
    return jsonb_build_object('result', 'invalid_state', 'payload', public.order_payload(p_order_id));
  end if;

  update public.orders
  set
    payment_method = 'prepaid',
    payment_status = 'paid',
    razorpay_payment_id = coalesce(p_payment_id, razorpay_payment_id),
    paid_at = now(),
    failure_reason = null
  where id = p_order_id;

  perform public.enqueue_meta_purchase(p_order_id);

  return jsonb_build_object('result', 'paid', 'payload', public.order_payload(p_order_id));
end;
$$;

create or replace function public.claim_meta_event_outbox(p_limit integer)
returns setof public.meta_event_outbox
language plpgsql
as $$
begin
  return query
  with picked as (
    select id
    from public.meta_event_outbox
    where (
        status in ('pending', 'retry')
        or (status = 'processing' and updated_at < now() - interval '10 minutes')
      )
      and next_attempt_at <= now()
    order by next_attempt_at
    limit greatest(1, least(coalesce(p_limit, 10), 50))
    for update skip locked
  )
  update public.meta_event_outbox o
  set status = 'processing', updated_at = now()
  from picked
  where o.id = picked.id
  returning o.*;
end;
$$;

create or replace function public.reconcile_meta_purchase_outbox()
returns integer
language plpgsql
as $$
declare
  inserted integer;
begin
  insert into public.meta_event_outbox (
    event_name,
    event_id,
    order_id,
    status,
    next_attempt_at,
    client_ip_address,
    client_user_agent
  )
  select
    'Purchase',
    'purchase_' || o.public_id,
    o.id,
    'pending',
    now(),
    o.meta_client_ip_address,
    o.meta_client_user_agent
  from public.orders o
  where o.status = 'open'
    and o.payment_status = 'paid'
    and o.payment_method = 'prepaid'
    and coalesce(o.marketing_consent, false) = true
    and (o.razorpay_payment_id is null or o.razorpay_payment_id not like 'sim_%')
  on conflict (event_name, event_id) do nothing;

  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

revoke all on function public.enqueue_meta_purchase(uuid) from public, anon, authenticated;
revoke all on function public.claim_meta_event_outbox(integer) from public, anon, authenticated;
revoke all on function public.reconcile_meta_purchase_outbox() from public, anon, authenticated;
grant execute on function public.enqueue_meta_purchase(uuid) to service_role;
grant execute on function public.claim_meta_event_outbox(integer) to service_role;
grant execute on function public.reconcile_meta_purchase_outbox() to service_role;