const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkSchema() {
  console.log("Checking tables...");
  const tables = ['donors', 'requests', 'outreach', 'messages_log'];
  for (const table of tables) {
    const { data, error } = await supabase.from(table).select('*').limit(1);
    if (error) {
      console.error(`Error fetching from ${table}:`, error.message);
    } else {
      console.log(`\nTable [${table}] columns:`);
      if (data && data.length > 0) {
        console.log(Object.keys(data[0]));
      } else {
        console.log("(No rows found, let's fetch metadata using RPC or insert attempt)");
      }
    }
  }
  process.exit(0);
}

checkSchema().catch(e => {
  console.error(e);
  process.exit(1);
});
