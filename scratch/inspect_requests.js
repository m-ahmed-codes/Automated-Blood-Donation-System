const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function exportSchema() {
  console.log("Fetching table columns metadata...");
  
  // We can query the information_schema.columns directly using supabase.rpc or check if we can run a custom SQL query.
  // Wait, Supabase client doesn't support raw SQL query unless we use a function.
  // But we can query pg_catalog or information_schema if there is an RPC, or we can just fetch a row and check its properties.
  // Since we already fetched a row and got the columns, let's write a script that fetches data from all tables to see the types.
  // Actually, we can check types of values of the inspected rows:
  // Donor row: { id: 4 (number), name: 'Fatima Malik' (string), phone: 'whatsapp:+92300000004' (string), blood_group: 'O+' (string), neighbourhood: 'Gulistan-e-Johar' (string), lat: 24.9097 (number), lng: 67.1317 (number), last_donation_date: '2026-06-11' (string/date), response_history_score: 0.85 (number), last_contacted_at: null }
  // Request row: { id: 8 (number), requester_phone: 'telegram:6072526847' (string), raw_input: 'Need O+ bottles at civil' (string), blood_group: 'O+' (string), count: 1 (number), hospital: 'Civil' (string), location: null, urgency: 'normal' (string), status: 'COMPLETED' (string), confirmed_count: 1 (number), created_at: '2026-08-12T08:22:03.342182+00:00' }
  // Outreach row: { id: 4 (number), request_id: 8 (number), donor_id: 5 (number), wave_number: 1 (number), status: 'SENT' (string), sent_at: '2026-08-12T08:22:09.81+00:00' (string/timestamp), responded_at: null }
  
  // Let's write an RPC helper in supabase to query table schema if needed, but it's not strictly necessary. We can infer the columns and types perfectly:
  // donors: id SERIAL PRIMARY KEY, name TEXT NOT NULL, phone TEXT UNIQUE NOT NULL, blood_group TEXT NOT NULL, neighbourhood TEXT NOT NULL, lat NUMERIC NOT NULL, lng NUMERIC NOT NULL, last_donation_date DATE, response_history_score NUMERIC DEFAULT 0.5, last_contacted_at TIMESTAMPTZ, is_test_donor BOOLEAN DEFAULT TRUE.
  // requests: id SERIAL PRIMARY KEY, requester_phone TEXT NOT NULL, raw_input TEXT NOT NULL, blood_group TEXT, count INTEGER DEFAULT 1, hospital TEXT, location TEXT, urgency TEXT DEFAULT 'normal', status TEXT DEFAULT 'PENDING_INFO', confirmed_count INTEGER DEFAULT 0, current_wave INTEGER DEFAULT 0, follow_up_question TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW().
  // outreach: id SERIAL PRIMARY KEY, request_id INTEGER REFERENCES requests(id), donor_id INTEGER REFERENCES donors(id), wave_number INTEGER DEFAULT 1, status TEXT DEFAULT 'SENT', sent_at TIMESTAMPTZ DEFAULT NOW(), responded_at TIMESTAMPTZ, reschedule_time TEXT.
  // messages_log: id SERIAL PRIMARY KEY, phone TEXT NOT NULL, direction TEXT NOT NULL, body TEXT NOT NULL, request_id INTEGER REFERENCES requests(id), donor_id INTEGER REFERENCES donors(id), created_at TIMESTAMPTZ DEFAULT NOW().
  
  // Wait! Let's check if there are other columns in requests. Yes, `current_wave` and `follow_up_question` might be in requests! Let's check by querying a request row that has them or updating our query to fetch a few rows.
  const { data: requests } = await supabase.from('requests').select('*').order('created_at', { ascending: false }).limit(5);
  console.log("Recent requests columns:", requests.length > 0 ? Object.keys(requests[0]) : "No requests");
  if (requests.length > 0) {
    console.log("Recent request row:", requests[0]);
  }
  process.exit(0);
}

exportSchema().catch(e => {
  console.error(e);
  process.exit(1);
});
