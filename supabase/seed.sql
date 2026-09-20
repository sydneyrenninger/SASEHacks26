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

-- =====================================================
-- NEPAL DEMO DATA
-- The people are fictional; the places are real landmarks or cities.
-- =====================================================

insert into public.locations
(name, latitude, longitude, address, location_type)
values
('Kathmandu Durbar Square', 27.7048, 85.3076, 'Basantapur, Kathmandu', 'landmark'),
('Swayambhunath Stupa', 27.7149, 85.2906, 'Swayambhu, Kathmandu', 'landmark'),
('Patan Durbar Square', 27.6729, 85.3256, 'Mangal Bazaar, Lalitpur', 'landmark'),
('Lakeside Pokhara', 28.2096, 83.9573, 'Lakeside Road, Pokhara', 'neighborhood'),
('Bharatpur Hospital', 27.6833, 84.4297, 'Bharatpur, Chitwan', 'hospital'),
('Biratnagar Bus Park', 26.4525, 87.2718, 'Biratnagar, Morang', 'transit'),
('Nepalgunj Airport', 28.1039, 81.6667, 'Ranjha, Nepalgunj', 'transit'),
('Dharan Clock Tower', 26.8147, 87.2797, 'Dharan, Sunsari', 'landmark');

insert into public.people
(name, age, gender, description, clothing, last_seen_date, last_seen_location, status)
values
('Anisha Gurung', 24, 'female', 'Long black hair, small scar near left eyebrow.', 'Green shawl, dark trousers, canvas shoes.', '2026-09-19 09:20:00+05:45', 'Kathmandu Durbar Square', 'missing'),
('Bikram Thapa', 36, 'male', 'Short hair, wears rectangular glasses.', 'Blue windbreaker, black backpack, running shoes.', '2026-09-18 17:40:00+05:45', 'Swayambhunath Stupa', 'missing'),
('Mina Shrestha', 52, 'female', 'Gray-streaked hair, walks with a slight limp.', 'Red kurta, navy shawl, brown sandals.', '2026-09-17 13:05:00+05:45', 'Patan Durbar Square', 'missing'),
('Roshan Karki', 17, 'male', 'Curly hair, faint birthmark on right cheek.', 'Yellow hoodie, gray jeans, white sneakers.', '2026-09-19 15:10:00+05:45', 'Lakeside Pokhara', 'missing'),
('Kamala Rai', 68, 'female', 'Short silver hair, uses a walking cane.', 'Purple sweater, black skirt, green scarf.', '2026-09-16 10:30:00+05:45', 'Bharatpur Hospital', 'missing'),
('Suman Yadav', 29, 'male', 'Medium build, trimmed beard, brown eyes.', 'White shirt, charcoal pants, blue sandals.', '2026-09-18 08:50:00+05:45', 'Biratnagar Bus Park', 'missing'),
('Pratima Bista', 41, 'female', 'Shoulder-length hair, wears silver earrings.', 'Orange kurta, black shawl, dark shoes.', '2026-09-17 18:15:00+05:45', 'Nepalgunj Airport', 'missing'),
('Nabin Limbu', 33, 'male', 'Tall, close-cropped hair, small tattoo on wrist.', 'Brown jacket, blue jeans, black backpack.', '2026-09-19 07:45:00+05:45', 'Dharan Clock Tower', 'missing');

insert into public.sightings
(person_id, location_id, name, age, description, sighting_date, verification_status)
values
(null, (select id from public.locations where name = 'Patan Durbar Square' limit 1), 'Anisha Gurung', 25, 'Young woman with long dark hair and a green shawl near the east courtyard.', '2026-09-19 11:00:00+05:45', 'pending'),
(null, (select id from public.locations where name = 'Kathmandu Durbar Square' limit 1), 'Bikram Thapa', 35, 'Man with glasses wearing a blue jacket and carrying a black backpack.', '2026-09-18 18:10:00+05:45', 'pending'),
(null, (select id from public.locations where name = 'Lakeside Pokhara' limit 1), 'Roshan Karki', 17, 'Teenager in a yellow hoodie walking toward the lakeside market.', '2026-09-19 16:00:00+05:45', 'unverified'),
(null, (select id from public.locations where name = 'Bharatpur Hospital' limit 1), 'Kamala Rai', 69, 'Older woman with silver hair and a walking cane near the outpatient entrance.', '2026-09-16 12:20:00+05:45', 'pending'),
(null, (select id from public.locations where name = 'Biratnagar Bus Park' limit 1), 'Suman Yadav', 30, 'Man in a white shirt waiting near the intercity buses.', '2026-09-18 09:30:00+05:45', 'unverified'),
(null, (select id from public.locations where name = 'Dharan Clock Tower' limit 1), 'Nabin Limbu', 33, 'Tall man in a brown jacket with a dark backpack near the clock tower.', '2026-09-19 08:30:00+05:45', 'pending');