-- Incremental coupon and SKU price migration for an existing Plain Thread database.
-- Do not run this against production unless you intend to migrate that database.
-- Fresh installs can use supabase/schema.sql instead (npm run db:apply). This file is not applied automatically.
--
-- Backfill: variants for the three catalogue colourways with a null price_paise become 69900 (the catalogue list price, ₹699).
-- Existing non-null prices are left unchanged. Historical orders are unchanged; new columns default to no discount.

create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  discount_percent integer not null,
  eligibility_type text not null,
  min_cart_value_paise integer,
  min_quantity integer,
  eligible_product_slugs text[] not null default '{}',
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coupons_code_unique unique (code),
  constraint coupons_percent_check check (discount_percent between 1 and 99),
  constraint coupons_type_check check (eligibility_type in ('MIN_CART_VALUE', 'MIN_QUANTITY')),
  constraint coupons_code_percent_check check (
    code ~ '^COUPON(0[1-9]|[1-9][0-9])$'
    and discount_percent = substring(code from 7 for 2)::integer
  ),
  constraint coupons_threshold_check check (
    (
      eligibility_type = 'MIN_CART_VALUE'
      and min_cart_value_paise > 0
      and min_quantity is null
    )
    or (
      eligibility_type = 'MIN_QUANTITY'
      and min_quantity > 0
      and min_cart_value_paise is null
    )
  )
);

alter table public.coupons enable row level security;

drop trigger if exists coupons_touch_updated_at on public.coupons;
create trigger coupons_touch_updated_at
  before update on public.coupons
  for each row execute function public.touch_updated_at();

alter table public.variants add column if not exists price_paise integer;
alter table public.variants drop constraint if exists variants_price_paise_check;
alter table public.variants add constraint variants_price_paise_check
  check (price_paise is null or price_paise > 0);

alter table public.orders add column if not exists discount_paise integer not null default 0;
alter table public.orders add column if not exists coupon_code text;
alter table public.orders add column if not exists coupon_percent integer;
alter table public.orders add column if not exists coupon_snapshot jsonb;
alter table public.order_items add column if not exists discount_paise integer not null default 0;

update public.variants
set price_paise = 69900
where price_paise is null
  and product_slug in (
    'black-oversized-tshirt',
    'white-oversized-tshirt',
    'pink-oversized-tshirt'
  );

drop function if exists public.checkout_create(text, jsonb, jsonb, integer, integer, integer);
drop function if exists public.checkout_create(text, jsonb, jsonb, integer, integer, integer, integer, integer, text, integer, integer, integer);
drop function if exists public.checkout_create(text, jsonb, jsonb, integer, integer, integer, integer, integer, integer, text, integer, integer, integer);
drop function if exists public.checkout_create(text, jsonb, jsonb, integer, integer, integer, integer, integer, integer, text, integer, integer, integer, integer, text, integer, jsonb);

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
  p_igst_paise integer,
  p_discount_paise integer default 0,
  p_coupon_code text default null,
  p_coupon_percent integer default null,
  p_coupon_snapshot jsonb default null
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
  v_price integer;
  v_goods integer := 0;
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

    select id, sku, stock, price_paise into v_id, v_sku, v_stock, v_price
    from public.variants
    where product_slug = item->>'product_slug'
      and size = item->>'size'
    for update;

    if v_id is null then
      raise exception 'UNKNOWN_VARIANT';
    end if;

    if v_price is null or v_price < 1 then
      raise exception 'MISSING_PRICE:%', item->>'product_slug' || ':' || (item->>'size');
    end if;

    if v_stock < qty then
      raise exception 'OUT_OF_STOCK:%', item->>'product_slug' || ':' || (item->>'size');
    end if;

    v_goods := v_goods + v_price * qty;

    update public.variants
    set stock = stock - qty
    where id = v_id;
  end loop;

  if p_subtotal_paise is distinct from v_goods then
    raise exception 'PRICE_CHANGED';
  end if;

  if coalesce(p_discount_paise, 0) < 0 or coalesce(p_discount_paise, 0) > v_goods then
    raise exception 'INVALID_DISCOUNT';
  end if;

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
    discount_paise,
    coupon_code,
    coupon_percent,
    coupon_snapshot,
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
    coalesce(p_discount_paise, 0),
    nullif(p_coupon_code, ''),
    p_coupon_percent,
    p_coupon_snapshot,
    p_total_paise,
    now() + make_interval(mins => greatest(2, least(coalesce(p_hold_minutes, 2), 60))),
    v_user_id
  )
  returning id into new_id;

  insert into public.order_items (
    order_id, variant_id, product_slug, size, sku, name, qty, unit_price_paise, discount_paise, stock_held
  )
  select
    new_id,
    v.id,
    line_item->>'product_slug',
    line_item->>'size',
    v.sku,
    line_item->>'name',
    (line_item->>'qty')::integer,
    v.price_paise,
    coalesce((line_item->>'discount_paise')::integer, 0),
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

revoke all on public.coupons from anon, authenticated;
revoke all on function public.checkout_create(text, jsonb, jsonb, integer, integer, integer, integer, integer, integer, text, integer, integer, integer, integer, text, integer, jsonb) from public, anon, authenticated;
grant execute on function public.checkout_create(text, jsonb, jsonb, integer, integer, integer, integer, integer, integer, text, integer, integer, integer, integer, text, integer, jsonb) to service_role;
