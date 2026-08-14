-- Seed data for local development and testing.
--
-- Applied by `supabase db reset` after the migrations. Safe to re-run.

-- ---------------------------------------------------------------------------
-- Governorates — all 27, so extending coverage is a toggle and two numbers
-- rather than data entry (FR-056a).
--
-- Only Cairo and Giza are active. Their fee and minimum are PLACEHOLDERS
-- pending the real figures from the business — they decide what every customer
-- is charged and which orders get refused, so replace them before launch.
-- ---------------------------------------------------------------------------
insert into public.governorates (name_ar, name_en, delivery_fee, min_order_value, is_active, sort_order) values
  ('القاهرة',        'Cairo',           2500, 15000, true,  1),   -- PLACEHOLDER: 25.00 fee / 150.00 minimum
  ('الجيزة',         'Giza',            3000, 15000, true,  2),   -- PLACEHOLDER: 30.00 fee / 150.00 minimum
  ('الإسكندرية',     'Alexandria',         0,     0, false, 3),
  ('القليوبية',      'Qalyubia',           0,     0, false, 4),
  ('الشرقية',        'Sharqia',            0,     0, false, 5),
  ('الدقهلية',       'Dakahlia',           0,     0, false, 6),
  ('البحيرة',        'Beheira',            0,     0, false, 7),
  ('المنوفية',       'Monufia',            0,     0, false, 8),
  ('الغربية',        'Gharbia',            0,     0, false, 9),
  ('كفر الشيخ',      'Kafr El Sheikh',     0,     0, false, 10),
  ('دمياط',          'Damietta',           0,     0, false, 11),
  ('بورسعيد',        'Port Said',          0,     0, false, 12),
  ('الإسماعيلية',    'Ismailia',           0,     0, false, 13),
  ('السويس',         'Suez',               0,     0, false, 14),
  ('شمال سيناء',     'North Sinai',        0,     0, false, 15),
  ('جنوب سيناء',     'South Sinai',        0,     0, false, 16),
  ('الفيوم',         'Faiyum',             0,     0, false, 17),
  ('بني سويف',       'Beni Suef',          0,     0, false, 18),
  ('المنيا',         'Minya',              0,     0, false, 19),
  ('أسيوط',          'Asyut',              0,     0, false, 20),
  ('سوهاج',          'Sohag',              0,     0, false, 21),
  ('قنا',            'Qena',               0,     0, false, 22),
  ('الأقصر',         'Luxor',              0,     0, false, 23),
  ('أسوان',          'Aswan',              0,     0, false, 24),
  ('البحر الأحمر',   'Red Sea',            0,     0, false, 25),
  ('الوادي الجديد',  'New Valley',         0,     0, false, 26),
  ('مطروح',          'Matrouh',            0,     0, false, 27)
on conflict (lower(name_en)) do nothing;

-- ---------------------------------------------------------------------------
-- Categories — a starter grocery tree, two levels
-- ---------------------------------------------------------------------------
insert into public.categories (name_ar, name_en, slug, sort_order) values
  ('خضروات وفواكه',  'Fruits & Vegetables', 'fruits-vegetables', 1),
  ('ألبان وأجبان',   'Dairy & Cheese',      'dairy-cheese',      2),
  ('مشروبات',        'Beverages',           'beverages',         3),
  ('بقالة',          'Pantry',              'pantry',            4),
  ('مجمدات',         'Frozen',              'frozen',            5),
  ('منظفات',         'Cleaning',            'cleaning',          6),
  ('عناية شخصية',    'Personal Care',       'personal-care',     7)
on conflict (slug) do nothing;

insert into public.categories (parent_id, name_ar, name_en, slug, sort_order)
select c.id, v.name_ar, v.name_en, v.slug, v.sort_order
from (values
  ('dairy-cheese',      'لبن',        'Milk',            'milk',           1),
  ('dairy-cheese',      'جبن',        'Cheese',          'cheese',         2),
  ('dairy-cheese',      'زبادي',      'Yoghurt',         'yoghurt',        3),
  ('beverages',         'عصائر',      'Juice',           'juice',          1),
  ('beverages',         'مياه',       'Water',           'water',          2),
  ('pantry',            'زيوت',       'Cooking Oil',     'cooking-oil',    1),
  ('pantry',            'أرز ومكرونة','Rice & Pasta',    'rice-pasta',     2),
  ('pantry',            'سكر وملح',   'Sugar & Salt',    'sugar-salt',     3)
) as v(parent_slug, name_ar, name_en, slug, sort_order)
join public.categories c on c.slug = v.parent_slug
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Brands — Egyptian FMCG names staff will recognise
-- ---------------------------------------------------------------------------
insert into public.brands (name_ar, name_en, slug) values
  ('جهينة',      'Juhayna',      'juhayna'),
  ('دومتي',      'Domty',        'domty'),
  ('بيتي',       'Beyti',        'beyti'),
  ('المراعي',    'Almarai',      'almarai'),
  ('لامار',      'Lamar',        'lamar'),
  ('إيديتا',     'Edita',        'edita'),
  ('شيبسي',      'Chipsy',       'chipsy'),
  ('حلواني',     'Halwani',      'halwani'),
  ('أمريكانا',   'Americana',    'americana'),
  ('كريستال',    'Crystal',      'crystal'),
  ('الضحى',      'El Doha',      'el-doha'),
  ('نستله',      'Nestle',       'nestle')
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Products — prices in piastres (4500 = 45.00 EGP)
-- ---------------------------------------------------------------------------
insert into public.products (
  category_id, brand_id, name_ar, name_en, description_ar, description_en,
  slug, price, unit, pack_size, units_per_carton, weight_grams, sku,
  stock_qty, min_order_qty, storage
)
select
  cat.id, br.id, v.name_ar, v.name_en, v.desc_ar, v.desc_en,
  v.slug, v.price, v.unit::public.unit_type, v.pack_size, v.per_carton, v.grams, v.sku,
  v.stock, v.min_qty, v.storage::public.storage_type
from (values
  ('milk','juhayna','لبن جهينة كامل الدسم 1 لتر','Juhayna Full Cream Milk 1L',
   'لبن طبيعي كامل الدسم معقم','Sterilised full cream milk',
   'juhayna-full-cream-1l', 4500,'piece','1 L',12,1030,'JUH-MLK-1L',240,1,'chilled'),

  ('milk','beyti','لبن بيتي خالي الدسم 1 لتر','Beyti Skimmed Milk 1L',
   'لبن خالي الدسم','Skimmed milk',
   'beyti-skimmed-1l', 4300,'piece','1 L',12,1030,'BEY-MLK-1L',180,1,'chilled'),

  ('cheese','domty','جبنة دومتي بيضاء 500 جم','Domty White Cheese 500g',
   'جبنة بيضاء طرية','Soft white cheese',
   'domty-white-500g', 6200,'piece','500 g',24,500,'DMT-CHS-500',150,1,'chilled'),

  ('yoghurt','almarai','زبادي المراعي 105 جم','Almarai Yoghurt 105g',
   'زبادي طبيعي','Plain set yoghurt',
   'almarai-yoghurt-105g', 900,'piece','105 g',48,105,'ALM-YOG-105',600,6,'chilled'),

  ('juice','lamar','عصير لامار مانجو 1 لتر','Lamar Mango Juice 1L',
   'عصير مانجو طبيعي','Natural mango juice',
   'lamar-mango-1l', 3800,'piece','1 L',12,1050,'LAM-JCE-MNG',300,1,'ambient'),

  ('water','crystal','مياه كريستال 1.5 لتر','Crystal Water 1.5L',
   'مياه معدنية طبيعية','Natural mineral water',
   'crystal-water-1500', 700,'piece','1.5 L',6,1500,'CRY-WTR-15',900,6,'ambient'),

  ('water','crystal','كرتونة مياه كريستال 6×1.5 لتر','Crystal Water Carton 6x1.5L',
   'كرتونة مياه معدنية','Carton of mineral water',
   'crystal-water-carton', 3900,'carton','6 x 1.5 L',1,9000,'CRY-WTR-CTN',150,1,'ambient'),

  ('cooking-oil','el-doha','زيت الضحى عباد الشمس 1 لتر','El Doha Sunflower Oil 1L',
   'زيت عباد الشمس للطهي','Sunflower cooking oil',
   'el-doha-sunflower-1l', 8500,'piece','1 L',12,920,'DOH-OIL-1L',200,1,'ambient'),

  ('rice-pasta','el-doha','أرز مصري 1 كجم','Egyptian Rice 1kg',
   'أرز مصري حبة قصيرة','Egyptian short grain rice',
   'egyptian-rice-1kg', 5200,'kilo','1 kg',10,1000,'DOH-RIC-1K',400,2,'ambient'),

  ('sugar-salt','el-doha','سكر أبيض 1 كجم','White Sugar 1kg',
   'سكر أبيض ناعم','Fine white sugar',
   'white-sugar-1kg', 3600,'kilo','1 kg',10,1000,'DOH-SUG-1K',500,2,'ambient'),

  ('frozen','americana','بانيه أمريكانا 1 كجم','Americana Chicken Pane 1kg',
   'بانيه دجاج مجمد','Frozen breaded chicken',
   'americana-pane-1kg', 21500,'pack','1 kg',8,1000,'AMR-PNE-1K',80,1,'frozen'),

  ('pantry','edita','مولتو كرواسون شوكولاتة','Molto Chocolate Croissant',
   'كرواسون محشو شوكولاتة','Chocolate-filled croissant',
   'molto-chocolate', 500,'piece','60 g',30,60,'EDT-MLT-CHO',700,6,'ambient')
) as v(cat_slug, brand_slug, name_ar, name_en, desc_ar, desc_en, slug, price,
       unit, pack_size, per_carton, grams, sku, stock, min_qty, storage)
join public.categories cat on cat.slug = v.cat_slug
join public.brands br on br.slug = v.brand_slug
on conflict (slug) do nothing;

-- Cost prices — admin-only, and the reason product_costs is its own table.
insert into public.product_costs (product_id, cost_price, supplier_name)
select p.id, (p.price * 0.72)::integer, 'Default supplier'
from public.products p
on conflict (product_id) do nothing;

-- ---------------------------------------------------------------------------
-- Promotions — one live, one expired, one future, so the pricing rules are
-- exercised by simply opening the site.
-- ---------------------------------------------------------------------------
insert into public.promotions (name_ar, name_en, discount_type, discount_value, starts_at, ends_at, product_id, is_active)
select 'خصم اللبن', 'Milk discount', 'percent', 10, now() - interval '1 day', now() + interval '30 days', p.id, true
from public.products p where p.slug = 'juhayna-full-cream-1l'
on conflict do nothing;

insert into public.promotions (name_ar, name_en, discount_type, discount_value, starts_at, ends_at, category_id, is_active)
select 'عروض المشروبات', 'Beverages offer', 'fixed', 300, now() - interval '2 days', now() + interval '14 days', c.id, true
from public.categories c where c.slug = 'beverages'
on conflict do nothing;

insert into public.promotions (name_ar, name_en, discount_type, discount_value, starts_at, ends_at, product_id, is_active)
select 'عرض منتهي', 'Expired offer', 'percent', 50, now() - interval '30 days', now() - interval '1 day', p.id, true
from public.products p where p.slug = 'white-sugar-1kg'
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Bootstrap admin
--
-- Staff accounts are created by an administrator, never self-registered
-- (FR-060) — so the first one has to come from here.
--
-- Phone +201000000001, and on a local stack the password is whatever you set
-- through Supabase Auth. On a hosted project, create the user through the
-- dashboard and then run:
--   update public.profiles set role = 'admin' where phone = '+201000000001';
-- ---------------------------------------------------------------------------
do $$
declare
  v_admin_id uuid := '00000000-0000-4000-8000-000000000001';
begin
  if to_regclass('auth.users') is null then
    raise notice 'auth.users absent — skipping bootstrap admin';
    return;
  end if;

  begin
    insert into auth.users (id, email)
    values (v_admin_id, '201000000001@phone.elgomala.local')
    on conflict (id) do nothing;
  exception when others then
    raise notice 'could not seed auth user (%) — create it through the dashboard instead', sqlerrm;
    return;
  end;

  insert into public.profiles (id, full_name, phone, role)
  values (v_admin_id, 'El-Gomala Admin', '+201000000001', 'admin')
  on conflict (id) do update set role = 'admin';
end $$;
