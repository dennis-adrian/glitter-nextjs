import { relations } from 'drizzle-orm';
import {
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const userRoleEnum = pgEnum('user_role', ['admin', 'artist', 'user']);
export const users = pgTable(
  'users',
  {
    id: serial('id').primaryKey(),
    bio: text('bio'),
    clerkId: text('clerk_id').unique().notNull(),
    displayName: text('display_name'),
    firstName: text('first_name'),
    email: text('email').unique().notNull(),
    imageUrl: text('image_url'),
    lastName: text('last_name'),
    phoneNumber: text('phone_number'),
    role: userRoleEnum('role').default('user').notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (users) => ({
    displayNameIdx: index('display_name_idx').on(users.displayName),
  }),
);
export const usersRelations = relations(users, ({ many }) => ({
  socials: many(usersToSocials),
}));

export const socials = pgTable('socials', {
  id: serial('id').primaryKey(),
  name: text('name').unique().notNull(),
  url: text('url').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const socialsRelations = relations(
  socials,
  ({ many }) => ({
    users: many(usersToSocials),
  }),
);

export const usersToSocials = pgTable(
  'users_to_socials',
  {
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    socialId: integer('social_id')
      .notNull()
      .references(() => users.id),
    username: text('username').notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.socialId] }),
  }),
);

export const usersToSocialsRelations = relations(usersToSocials, ({ one }) => ({
  user: one(users, {
    fields: [usersToSocials.userId],
    references: [users.id],
  }),
  social: one(socials, {
    fields: [usersToSocials.socialId],
    references: [socials.id],
  }),
}));
