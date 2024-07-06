const { pool, db } = require("@/db");
const { festivals } = require("@/db/schema");

async function seedFestivals() {
  console.info("Empty seeds");
}

async function main() {
  const client = await pool.connect();
  await seedFestivals();
  client.release();
}

main().catch((err) => {
  console.error("An error occur while attempting to seed the database", err);
});
