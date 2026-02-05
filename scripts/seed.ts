const { pool, db } = require("@/db");
const { festivals } = require("@/db/schema");

async function seedFestivals() {
  console.info("Empty seeds");
}

async function main() {
  if (!process.env.POSTGRES_URL) {
    console.info("POSTGRES_URL is not set. Skipping seed.");
    return;
  }

  try {
    const client = await pool.connect();
    await seedFestivals();
    client.release();
  } catch (err: any) {
    if (err?.code === "ECONNREFUSED") {
      console.warn(
        "Could not connect to the database. Skipping seed. " +
        "Make sure your database is running and POSTGRES_URL is correct."
      );
    } else {
      throw err;
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("An error occurred while attempting to seed the database", err);
});
