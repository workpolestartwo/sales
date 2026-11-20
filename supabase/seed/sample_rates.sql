-- Sample rates for testing the Rates dashboard. Run AFTER migration 0007.
-- 5 lanes (4 exports from Nhava Sheva + 1 import from Shanghai), each with 20', 40', 40' HC and co-load.
-- Updated by different (sample) team members at different times, with a mix of:
--   valid rates, rates expiring tomorrow, and expired rates that need updating.
-- Figures are illustrative test numbers, not market quotes.
--
-- Safe to re-run: same lane + container is overwritten.
-- To remove them later:  delete from public.rates where notes like '%[sample]%';

insert into public.rates
  (direction, origin, destination, container_type, buy_rate, currency, valid_until, source, notes, updated_by_name, updated_at)
values
  -- Nhava Sheva -> Jebel Ali: fresh, updated this morning
  ('export', 'Nhava Sheva', 'Jebel Ali', '20GP',  450, 'USD', current_date + 6, 'Gulf Link Shipping',        'Transit ~5 days. 7 free days at destination. [sample]', 'Ramesh Patel',  now() - interval '3 hours'),
  ('export', 'Nhava Sheva', 'Jebel Ali', '40GP',  750, 'USD', current_date + 6, 'Gulf Link Shipping',        'Transit ~5 days. [sample]',                             'Ramesh Patel',  now() - interval '3 hours'),
  ('export', 'Nhava Sheva', 'Jebel Ali', '40HC',  800, 'USD', current_date + 6, 'Gulf Link Shipping',        'Transit ~5 days. [sample]',                             'Ramesh Patel',  now() - interval '3 hours'),
  ('export', 'Nhava Sheva', 'Jebel Ali', 'LCL',    18, 'USD', current_date + 5, 'Seabridge Consolidators',   'Min 1 CBM. Weekly sailing on Tuesdays. [sample]',       'Sneha Iyer',    now() - interval '1 day'),

  -- Nhava Sheva -> Singapore: valid, 2 days old
  ('export', 'Nhava Sheva', 'Singapore', '20GP',  380, 'USD', current_date + 4, 'Straits Line Agencies',     'Transit ~9 days. [sample]',                             'Amit Shah',     now() - interval '2 days'),
  ('export', 'Nhava Sheva', 'Singapore', '40GP',  650, 'USD', current_date + 4, 'Straits Line Agencies',     'Transit ~9 days. [sample]',                             'Amit Shah',     now() - interval '2 days'),
  ('export', 'Nhava Sheva', 'Singapore', '40HC',  700, 'USD', current_date + 4, 'Straits Line Agencies',     'Transit ~9 days. [sample]',                             'Amit Shah',     now() - interval '2 days'),
  ('export', 'Nhava Sheva', 'Singapore', 'LCL',    15, 'USD', current_date + 4, 'Seabridge Consolidators',   'Min 1 CBM. [sample]',                                   'Sneha Iyer',    now() - interval '2 days'),

  -- Nhava Sheva -> Rotterdam: expiring tomorrow (shows yellow)
  ('export', 'Nhava Sheva', 'Rotterdam', '20GP', 1250, 'USD', current_date + 1, 'NorthSea Freight Partners', 'Transit ~24 days via Suez. Ask before quoting long-term. [sample]', 'Priya Mehta', now() - interval '6 days'),
  ('export', 'Nhava Sheva', 'Rotterdam', '40GP', 2100, 'USD', current_date + 1, 'NorthSea Freight Partners', 'Transit ~24 days. [sample]',                            'Priya Mehta',   now() - interval '6 days'),
  ('export', 'Nhava Sheva', 'Rotterdam', '40HC', 2200, 'USD', current_date + 1, 'NorthSea Freight Partners', 'Transit ~24 days. [sample]',                            'Priya Mehta',   now() - interval '6 days'),
  ('export', 'Nhava Sheva', 'Rotterdam', 'LCL',    45, 'USD', current_date + 3, 'EuroCon Co-loaders',        'Min 2 CBM. Fortnightly. [sample]',                      'Rahul Kulkarni', now() - interval '4 days'),

  -- Nhava Sheva -> New York: EXPIRED (hidden by default, shows "needs update")
  ('export', 'Nhava Sheva', 'New York',  '20GP', 2400, 'USD', current_date - 2, 'Atlantic Bridge Logistics', 'Transit ~32 days. Rates moving up, recheck. [sample]',  'Vikram Desai',  now() - interval '9 days'),
  ('export', 'Nhava Sheva', 'New York',  '40GP', 3600, 'USD', current_date - 2, 'Atlantic Bridge Logistics', 'Transit ~32 days. [sample]',                            'Vikram Desai',  now() - interval '9 days'),
  ('export', 'Nhava Sheva', 'New York',  '40HC', 3700, 'USD', current_date - 2, 'Atlantic Bridge Logistics', 'Transit ~32 days. [sample]',                            'Vikram Desai',  now() - interval '9 days'),
  ('export', 'Nhava Sheva', 'New York',  'LCL',    85, 'USD', current_date - 1, 'EuroCon Co-loaders',        'Min 2 CBM. [sample]',                                   'Rahul Kulkarni', now() - interval '8 days'),

  -- Shanghai -> Nhava Sheva (IMPORT): valid, mixed editors
  ('import', 'Shanghai', 'Nhava Sheva', '20GP',   600, 'USD', current_date + 5, 'Eastwind Shipping Agency',  'Transit ~18 days. DO charges extra. [sample]',          'Sneha Iyer',    now() - interval '20 hours'),
  ('import', 'Shanghai', 'Nhava Sheva', '40GP',  1000, 'USD', current_date + 5, 'Eastwind Shipping Agency',  'Transit ~18 days. [sample]',                            'Sneha Iyer',    now() - interval '20 hours'),
  ('import', 'Shanghai', 'Nhava Sheva', '40HC',  1050, 'USD', current_date + 5, 'Eastwind Shipping Agency',  'Transit ~18 days. [sample]',                            'Amit Shah',     now() - interval '5 hours'),
  ('import', 'Shanghai', 'Nhava Sheva', 'LCL',     22, 'USD', current_date + 6, 'Orient Consol Services',    'Min 1 CBM. CFS charges at destination extra. [sample]', 'Amit Shah',     now() - interval '5 hours')
on conflict (origin_key, destination_key, container_type) do update set
  direction = excluded.direction,
  buy_rate = excluded.buy_rate,
  currency = excluded.currency,
  valid_until = excluded.valid_until,
  source = excluded.source,
  notes = excluded.notes,
  updated_by = null,
  updated_by_name = excluded.updated_by_name,
  updated_at = excluded.updated_at;
