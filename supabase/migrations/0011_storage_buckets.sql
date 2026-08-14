-- 0011 — Storage bucket for product imagery
--
-- Public read by design: photos are shown to anonymous browsers, and public
-- reads are served from Cloudflare's cache rather than counting against the
-- Supabase egress allowance.
--
-- Writes are admin-only. Images are resized to WebP in the browser before
-- upload — the Workers 10 ms CPU ceiling rules out doing it server-side, and
-- the browser does it for free (research R12).
--
-- Guarded so `supabase db reset` works against a local stack that has the
-- storage schema, and a plain Postgres (used by the SQL test harness) that
-- does not.

do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'storage schema absent — skipping bucket setup (expected outside Supabase)';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'product-images',
    'product-images',
    true,
    5242880,  -- 5 MB backstop; browser-side resizing puts real uploads near 150 KB
    array['image/webp', 'image/jpeg', 'image/png']
  )
  on conflict (id) do nothing;

  execute $policy$
    create policy product_images_public_read on storage.objects
      for select to anon, authenticated
      using (bucket_id = 'product-images')
  $policy$;

  execute $policy$
    create policy product_images_admin_write on storage.objects
      for all to authenticated
      using (bucket_id = 'product-images' and public.is_admin())
      with check (bucket_id = 'product-images' and public.is_admin())
  $policy$;

exception
  when duplicate_object then
    raise notice 'storage policies already present — skipping';
end $$;
