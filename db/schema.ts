import { index, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable(
  'users',
  {
    id: serial('id').primaryKey(),
    firstName: text('first_name'),
    lastName: text('last_name'),
    displayName: text('display_name'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (users) => ({
    displayNameIdx: index('display_name_idx').on(users.displayName),
  }),
);
