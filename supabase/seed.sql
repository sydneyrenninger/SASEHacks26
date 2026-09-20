-- =====================================================
-- FAKE PEOPLE
-- =====================================================

insert into public.people
(name, age, gender, description, clothing, last_seen_date, last_seen_location, status)
values
(
  'Maya Patel',
  19,
  'female',
  'Brown hair, brown eyes, approximately 5 foot 4.',
  'Blue hoodie, black jeans, white sneakers.',
  '2026-09-18 14:30:00-05',
  'Central Library',
  'missing'
),
(
  'Daniel Kim',
  42,
  'male',
  'Black hair, glasses, approximately 5 foot 9.',
  'Gray jacket, navy shirt, khaki pants.',
  '2026-09-18 11:15:00-05',
  'Riverside Apartments',
  'missing'
),
(
  'Sofia Martinez',
  67,
  'female',
  'Gray hair, approximately 5 foot 2, uses a walking cane.',
  'Red cardigan and black pants.',
  '2026-09-18 09:00:00-05',
  'Oak Street Community Center',
  'missing'
);


-- =====================================================
-- FAKE LOCATIONS
-- =====================================================

insert into public.locations
(name, latitude, longitude, address, location_type)
values
(
  'Central Library',
  33.2098,
  -87.5692,
  '2100 Central Ave',
  'library'
),
(
  'Central Shelter',
  33.2110,
  -87.5660,
  '2200 Central Ave',
  'shelter'
),
(
  'Riverside Apartments',
  33.2140,
  -87.5800,
  '120 Riverside Drive',
  'residential'
),
(
  'Memorial Hospital',
  33.2050,
  -87.5520,
  '800 Medical Drive',
  'hospital'
),
(
  'Oak Street Community Center',
  33.2010,
  -87.5750,
  '320 Oak Street',
  'community_center'
);


-- =====================================================
-- FAKE SIGHTINGS
-- =====================================================

insert into public.sightings
(
  person_id,
  location_id,
  name,
  age,
  description,
  sighting_date,
  verification_status
)
values
(
  null,
  (select id from public.locations where name = 'Central Shelter' limit 1),
  'Maya Patil',
  20,
  'Young woman with brown hair wearing a blue sweatshirt and dark pants.',
  '2026-09-18 16:10:00-05',
  'pending'
),
(
  null,
  (select id from public.locations where name = 'Memorial Hospital' limit 1),
  'Daniel Kim',
  41,
  'Man wearing glasses and a gray jacket.',
  '2026-09-18 14:20:00-05',
  'pending'
),
(
  null,
  (select id from public.locations where name = 'Oak Street Community Center' limit 1),
  'Sofia Martinez',
  68,
  'Older woman with gray hair using a cane and wearing a red sweater.',
  '2026-09-18 12:45:00-05',
  'pending'
),
(
  null,
  (select id from public.locations where name = 'Central Shelter' limit 1),
  'Michael Brown',
  55,
  'Bald man wearing a red shirt and blue jeans.',
  '2026-09-20 11:30:00-05',
  'unverified'
);