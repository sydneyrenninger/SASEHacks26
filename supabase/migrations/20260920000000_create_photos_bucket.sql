insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

create policy "Public can view photos"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'photos');

create policy "Public can upload photos"
on storage.objects
for insert
to anon, authenticated
with check (bucket_id = 'photos');
