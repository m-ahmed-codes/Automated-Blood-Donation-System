-- ============================================================
-- Seed: 20 synthetic test donors across Karachi neighbourhoods
-- All is_test_donor = TRUE so no real Twilio calls are made
-- ============================================================

INSERT INTO donors (name, blood_group, neighbourhood, latitude, longitude, last_donation_date, response_history_rate, phone_mock, is_test_donor) VALUES
  ('Ahmed Raza',       'O+',  'Gulshan-e-Iqbal', 24.9215, 67.1114, NOW() - INTERVAL '120 days', 0.9,  'whatsapp:+92300000001', TRUE),
  ('Sara Khan',        'O+',  'Gulshan-e-Iqbal', 24.9230, 67.1130, NOW() - INTERVAL '200 days', 0.8,  'whatsapp:+92300000002', TRUE),
  ('Bilal Hussain',    'O+',  'North Nazimabad',  24.9420, 67.0680, NOW() - INTERVAL '95 days',  0.75, 'whatsapp:+92300000003', TRUE),
  ('Fatima Malik',     'O+',  'Gulistan-e-Johar', 24.9097, 67.1317, NOW() - INTERVAL '60 days',  0.85, 'whatsapp:+92300000004', TRUE),  -- ineligible
  ('Usman Ali',        'A+',  'Clifton',          24.8218, 67.0299, NOW() - INTERVAL '180 days', 0.95, 'whatsapp:+92300000005', TRUE),
  ('Nadia Siddiqui',   'A+',  'DHA Phase 5',      24.8102, 67.0750, NOW() - INTERVAL '130 days', 0.7,  'whatsapp:+92300000006', TRUE),
  ('Hassan Tariq',     'B+',  'Orangi Town',      24.9614, 66.9980, NOW() - INTERVAL '100 days', 0.6,  'whatsapp:+92300000007', TRUE),
  ('Mehwish Iqbal',    'B+',  'Liaquatabad',      24.9010, 67.0580, NOW() - INTERVAL '150 days', 0.8,  'whatsapp:+92300000008', TRUE),
  ('Tariq Mehmood',    'AB+', 'Saddar',           24.8608, 67.0104, NOW() - INTERVAL '300 days', 0.9,  'whatsapp:+92300000009', TRUE),
  ('Zainab Qureshi',   'AB-', 'PECHS',            24.8738, 67.0614, NOW() - INTERVAL '365 days', 0.85, 'whatsapp:+92300000010', TRUE),
  ('Imran Sheikh',     'O-',  'Malir',            24.8927, 67.1981, NOW() - INTERVAL '110 days', 0.7,  'whatsapp:+92300000011', TRUE),
  ('Asma Javed',       'O+',  'Korangi',          24.8474, 67.1295, NOW() - INTERVAL '92 days',  0.65, 'whatsapp:+92300000012', TRUE),
  ('Kamran Butt',      'O+',  'Nazimabad',        24.9198, 67.0425, NOW() - INTERVAL '200 days', 0.88, 'whatsapp:+92300000013', TRUE),
  ('Sana Mirza',       'A-',  'Gulshan-e-Iqbal', 24.9200, 67.1100, NOW() - INTERVAL '140 days', 0.72, 'whatsapp:+92300000014', TRUE),
  ('Rafiq Ahmed',      'B-',  'Lyari',            24.8590, 66.9956, NOW() - INTERVAL '500 days', 0.5,  'whatsapp:+92300000015', TRUE),
  ('Hina Baig',        'O+',  'Shah Faisal',      24.9041, 67.1501, NOW() - INTERVAL '160 days', 0.78, 'whatsapp:+92300000016', TRUE),
  ('Danish Nawaz',     'O+',  'Gulshan-e-Iqbal', 24.9245, 67.1155, NOW() - INTERVAL '95 days',  0.82, 'whatsapp:+92300000017', TRUE),
  ('Rukhsana Patel',   'AB+', 'Soldier Bazaar',   24.8815, 67.0365, NOW() - INTERVAL '420 days', 0.91, 'whatsapp:+92300000018', TRUE),
  ('Omer Farooq',      'O+',  'Federal B Area',   24.9315, 67.0720, NOW() - INTERVAL '105 days', 0.76, 'whatsapp:+92300000019', TRUE),
  ('Lubna Chaudhry',   'O-',  'Gulshan-e-Iqbal', 24.9210, 67.1125, NOW() - INTERVAL '200 days', 0.88, 'whatsapp:+92300000020', TRUE);
