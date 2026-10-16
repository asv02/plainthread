-- Coupon codes are now any letters + a 1-2 digit discount number (PLAIN5, SAVE25),
-- not just the literal word COUPON with exactly two digits.
begin;

alter table public.coupons
  drop constraint if exists coupons_code_percent_check;

alter table public.coupons
  add constraint coupons_code_percent_check check (
    code ~ '^[A-Z]+[0-9]{1,2}$'
    and discount_percent = (substring(code from '[0-9]+$'))::integer
  );

commit;
