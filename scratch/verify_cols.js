const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function verifyColumns() {
  const { data, error } = await supabase.from('requests').select('id, current_wave, follow_up_question').limit(1);
  if (error) {
    console.error("Columns do not exist or query failed:", error.message);
  } else {
    console.log("Columns exist! Row:", data);
  }
  process.exit(0);
}

verifyColumns();
