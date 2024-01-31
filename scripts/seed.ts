const { pool, db } = require('@/db');
const { festivals } = require('@/db/schema');

async function seedFestivals() {
  await db
    .insert(festivals)
    .values([
      {
        name: 'Glitter Demo',
        startDate: new Date('2023-08-17'),
        endDate: new Date('2023-08-17'),
        status: 'archived',
      },
      {
        name: 'Glitter Vol 1',
        startDate: new Date('2023-12-01'),
        endDate: new Date('2023-12-02'),
        status: 'archived',
      },
      {
        name: 'Glitter Vol 2',
        startDate: new Date('2024-03-02'),
        endDate: new Date('2024-03-03'),
        status: 'active',
      },
    ])
    .onConflictDoNothing({ target: festivals.name });

  console.log('Festivals seeded');
}

async function main() {
  const client = await pool.connect();
  await seedFestivals();
  client.release();
}

main().catch((err) => {
  console.error('An error occur while attempting to seed the database', err);
});
