-- Pricing engine — every case from the effective_price contract.
--
-- This is one of the four areas the constitution names as money-critical. A
-- rounding slip here is a dispute at the customer's door.

-- Fixtures with values chosen so the arithmetic is checkable by eye.
insert into public.categories (id, name_ar, name_en, slug)
values ('11111111-0000-4000-8000-000000000001', 'قسم اختبار', 'Test Parent', 'test-parent');

insert into public.categories (id, parent_id, name_ar, name_en, slug)
values ('11111111-0000-4000-8000-000000000002',
        '11111111-0000-4000-8000-000000000001', 'قسم فرعي', 'Test Child', 'test-child');

insert into public.brands (id, name_ar, name_en, slug)
values ('22222222-0000-4000-8000-000000000001', 'ماركة اختبار', 'Test Brand', 'test-brand');

-- Base price 1000 piastres (10.00 EGP) everywhere, so discounts are obvious.
insert into public.products (id, category_id, brand_id, name_ar, name_en, slug, price, unit, sku, stock_qty)
values
  ('33333333-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000002',
   '22222222-0000-4000-8000-000000000001', 'منتج أ', 'Product A', 'test-product-a', 1000, 'piece', 'TST-A', 100),
  ('33333333-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000002',
   '22222222-0000-4000-8000-000000000001', 'منتج ب', 'Product B', 'test-product-b', 1000, 'piece', 'TST-B', 100),
  ('33333333-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000002',
   '22222222-0000-4000-8000-000000000001', 'منتج ج', 'Product C', 'test-product-c', 1000, 'piece', 'TST-C', 100),
  ('33333333-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000002',
   '22222222-0000-4000-8000-000000000001', 'منتج د', 'Product D', 'test-product-d', 1000, 'piece', 'TST-D', 100),
  ('33333333-0000-4000-8000-000000000005', '11111111-0000-4000-8000-000000000002',
   '22222222-0000-4000-8000-000000000001', 'منتج هـ', 'Product E', 'test-product-e', 1000, 'piece', 'TST-E', 100),
  ('33333333-0000-4000-8000-000000000006', '11111111-0000-4000-8000-000000000002',
   '22222222-0000-4000-8000-000000000001', 'منتج و', 'Product F', 'test-product-f', 1000, 'piece', 'TST-F', 100);

-- No promotion at all.
select public.assert('pricing', 'no promotion leaves the base price',
  (select effective_price from public.effective_price('33333333-0000-4000-8000-000000000001')) = 1000);

select public.assert('pricing', 'no promotion reports no promotion id',
  (select promotion_id from public.effective_price('33333333-0000-4000-8000-000000000001')) is null);

-- 20% off 1000 = 800.
insert into public.promotions (name_ar, name_en, discount_type, discount_value, starts_at, ends_at, product_id)
values ('خصم ٢٠', '20 off', 'percent', 20, now() - interval '1 hour', now() + interval '1 day',
        '33333333-0000-4000-8000-000000000002');

select public.assert('pricing', '20 percent off 1000 is 800',
  (select effective_price from public.effective_price('33333333-0000-4000-8000-000000000002')) = 800);

-- 33% off 1000: the discount floors to 330, so the price is 670. Rounding
-- favours the customer, and the total can never exceed the sum of the line
-- prices shown.
insert into public.promotions (name_ar, name_en, discount_type, discount_value, starts_at, ends_at, product_id)
values ('خصم ٣٣', '33 off', 'percent', 33, now() - interval '1 hour', now() + interval '1 day',
        '33333333-0000-4000-8000-000000000003');

select public.assert('pricing', '33 percent off 1000 floors the discount to 330',
  (select effective_price from public.effective_price('33333333-0000-4000-8000-000000000003')) = 670);

-- A fixed discount larger than the price clamps at zero rather than going
-- negative (FR-029).
insert into public.promotions (name_ar, name_en, discount_type, discount_value, starts_at, ends_at, product_id)
values ('خصم كبير', 'Oversized', 'fixed', 5000, now() - interval '1 hour', now() + interval '1 day',
        '33333333-0000-4000-8000-000000000004');

select public.assert('pricing', 'a discount larger than the price clamps at zero',
  (select effective_price from public.effective_price('33333333-0000-4000-8000-000000000004')) = 0);

-- Two overlapping promotions: the better one wins and they do NOT compound.
-- Compounding would give 630; the correct answer is 700.
insert into public.promotions (name_ar, name_en, discount_type, discount_value, starts_at, ends_at, product_id)
values
  ('خصم ١٠', '10 off', 'percent', 10, now() - interval '1 hour', now() + interval '1 day',
   '33333333-0000-4000-8000-000000000005'),
  ('خصم ٣٠', '30 off', 'percent', 30, now() - interval '1 hour', now() + interval '1 day',
   '33333333-0000-4000-8000-000000000005');

select public.assert('pricing', 'overlapping promotions take the best, never compound',
  (select effective_price from public.effective_price('33333333-0000-4000-8000-000000000005')) = 700);

-- Windows: a promotion that has not started, and one that has ended, are both
-- ignored (FR-028).
insert into public.promotions (name_ar, name_en, discount_type, discount_value, starts_at, ends_at, product_id)
values ('عرض قادم', 'Future', 'percent', 50, now() + interval '1 day', now() + interval '2 days',
        '33333333-0000-4000-8000-000000000006');

select public.assert('pricing', 'a promotion starting tomorrow is not applied',
  (select effective_price from public.effective_price('33333333-0000-4000-8000-000000000006')) = 1000);

update public.promotions
set starts_at = now() - interval '10 days', ends_at = now() - interval '1 day'
where name_en = 'Future';

select public.assert('pricing', 'a promotion that ended yesterday is not applied',
  (select effective_price from public.effective_price('33333333-0000-4000-8000-000000000006')) = 1000);

-- Deactivating a promotion removes it regardless of dates.
update public.promotions set is_active = false where name_en = '20 off';

select public.assert('pricing', 'an inactive promotion is ignored even inside its window',
  (select effective_price from public.effective_price('33333333-0000-4000-8000-000000000002')) = 1000);

update public.promotions set is_active = true where name_en = '20 off';

-- Category scope reaches descendants: a promotion on the parent applies to a
-- product filed under the child (research R7).
delete from public.promotions where product_id = '33333333-0000-4000-8000-000000000001';

insert into public.promotions (name_ar, name_en, discount_type, discount_value, starts_at, ends_at, category_id)
values ('خصم القسم', 'Parent category', 'fixed', 250, now() - interval '1 hour', now() + interval '1 day',
        '11111111-0000-4000-8000-000000000001');

select public.assert('pricing', 'a promotion on an ancestor category reaches the child product',
  (select effective_price from public.effective_price('33333333-0000-4000-8000-000000000001')) = 750);

-- Brand scope.
delete from public.promotions;

insert into public.promotions (name_ar, name_en, discount_type, discount_value, starts_at, ends_at, brand_id)
values ('خصم الماركة', 'Brand wide', 'fixed', 100, now() - interval '1 hour', now() + interval '1 day',
        '22222222-0000-4000-8000-000000000001');

select public.assert('pricing', 'a brand promotion reaches every product of that brand',
  (select effective_price from public.effective_price('33333333-0000-4000-8000-000000000001')) = 900);

-- Catalog-wide scope: no product, category or brand set.
delete from public.promotions;

insert into public.promotions (name_ar, name_en, discount_type, discount_value, starts_at, ends_at)
values ('خصم عام', 'Catalog wide', 'percent', 5, now() - interval '1 hour', now() + interval '1 day');

select public.assert('pricing', 'a catalog-wide promotion reaches every product',
  (select effective_price from public.effective_price('33333333-0000-4000-8000-000000000001')) = 950);

delete from public.promotions;

-- Constraint checks: the schema refuses nonsense promotions.
select public.assert_raises('pricing', 'a percentage above 100 is refused',
  $$insert into public.promotions (name_ar, name_en, discount_type, discount_value, starts_at, ends_at)
    values ('س', 'x', 'percent', 150, now(), now() + interval '1 day')$$,
  'promotions_percent_bounded');

select public.assert_raises('pricing', 'an end date before the start is refused',
  $$insert into public.promotions (name_ar, name_en, discount_type, discount_value, starts_at, ends_at)
    values ('س', 'x', 'percent', 10, now(), now() - interval '1 day')$$,
  'promotions_window_ordered');

select public.assert_raises('pricing', 'a promotion cannot target two scopes at once',
  $$insert into public.promotions (name_ar, name_en, discount_type, discount_value, starts_at, ends_at, product_id, brand_id)
    values ('س', 'x', 'percent', 10, now(), now() + interval '1 day',
            '33333333-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000001')$$,
  'promotions_single_scope');

-- Search normalisation: the folding that makes Arabic search actually find
-- things (research R10).
select public.assert('pricing', 'alef variants fold together',
  public.search_normalize('أحمد') = public.search_normalize('احمد'));

select public.assert('pricing', 'ta marbuta folds to ha',
  public.search_normalize('مياة') = public.search_normalize('مياه'));

select public.assert('pricing', 'diacritics are stripped',
  public.search_normalize('لَبَن') = public.search_normalize('لبن'));

select public.assert('pricing', 'alef maqsura folds to ya',
  public.search_normalize('مصطفى') = public.search_normalize('مصطفي'));
