const { getRankedDonors } = require('../services/matchingEngine');
require('dotenv').config();

async function testRanking() {
  try {
    const donors = await getRankedDonors('8', 'O+', 'Civil');
    console.log("Ranked donors result:", donors);
  } catch (e) {
    console.error("Error running ranking:", e);
  }
  process.exit(0);
}

testRanking();
