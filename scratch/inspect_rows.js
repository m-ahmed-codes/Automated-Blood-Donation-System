const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function inspectRows() {
  const { data: donors } = await supabase.from('donors').select('*').limit(1);
  console.log("Donor row:", donors?.[0]);
  
  const { data: requests } = await supabase.from('requests').select('*').limit(1);
  console.log("Request row:", requests?.[0]);
  
  const { data: outreach } = await supabase.from('outreach').select('*').limit(1);
  console.log("Outreach row:", outreach?.[0]);
  
  process.exit(0);
}

inspectRows().catch(e => {
  console.error(e);
  process.exit(1);
});
