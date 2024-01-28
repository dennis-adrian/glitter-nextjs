const { client, db } = require('@/db');
const { socials } = require('@/db/schema');

async function seedSocialMedia() {
  await db
    .insert(socials)
    .values([
      { name: 'facebook', url: 'https://www.facebook.com/', updatedAt: new Date() },
      { name: 'instagram', url: 'https://www.instagram.com/', updatedAt: new Date() },
      { name: 'twitter', url: 'https://www.twitter.com/', updatedAt: new Date() },
      { name: 'tiktok', url: 'https://www.tiktok.com/', updated: new Date() },
    ])
    .onConflictDoNothing({ target: socials.name });

  console.log('Social media profiles seeded');
}

async function main() {
  await seedSocialMedia();
  await client.end();
}

main().catch((err) => {
  console.error('An error occur while attempting to seed the database', err);
});
