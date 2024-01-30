const { pool, db } = require('@/db');
const { socials, festivals } = require('@/db/schema');

async function seedSocialMedia() {
  await db
    .insert(socials)
    .values([
      {
        name: 'facebook',
        url: 'https://www.facebook.com/',
        updatedAt: new Date(),
      },
      {
        name: 'instagram',
        url: 'https://www.instagram.com/',
        updatedAt: new Date(),
      },
      {
        name: 'twitter',
        url: 'https://www.twitter.com/',
        updatedAt: new Date(),
      },
      { name: 'tiktok', url: 'https://www.tiktok.com/', updated: new Date() },
    ])
    .onConflictDoNothing({ target: socials.name });

  console.log('Social media profiles seeded');
}

async function seedFestivals() {
  await db
    .insert(festivals)
    .values([
      {
        name: 'Glitter Demo',
        startDate: new Date('2023-08-17'),
        endDate: new Date('2023-08-17'),
      },
      {
        name: 'Glitter Vol 1',
        startDate: new Date('2023-12-01'),
        endDate: new Date('2023-12-02'),
      },
      {
        name: 'Glitter Vol 2',
        startDate: new Date('2024-03-02'),
        endDate: new Date('2024-03-03'),
      },
    ])
    .onConflictDoNothing({ target: festivals.name });

  console.log('Festivals seeded');
}

async function main() {
  const client = await pool.connect();
  await seedSocialMedia();
  await seedFestivals();
  client.release();
}

main().catch((err) => {
  console.error('An error occur while attempting to seed the database', err);
});
