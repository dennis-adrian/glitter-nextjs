import { relations } from "drizzle-orm";
import {
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["admin", "artist", "user"]);
export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    bio: text("bio"),
    birthdate: timestamp("birthdate"),
    clerkId: text("clerk_id").unique().notNull(),
    displayName: text("display_name"),
    firstName: text("first_name"),
    email: text("email").unique().notNull(),
    imageUrl: text("image_url"),
    lastName: text("last_name"),
    phoneNumber: text("phone_number"),
    role: userRoleEnum("role").default("user").notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (users) => ({
    displayNameIdx: index("display_name_idx").on(users.displayName),
  }),
);
export const usersRelations = relations(users, ({ many }) => ({
  socials: many(usersToSocials),
  participationRequests: many(participationRequests),
}));

export const socials = pgTable("socials", {
  id: serial("id").primaryKey(),
  name: text("name").unique().notNull(),
  url: text("url").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const socialsRelations = relations(socials, ({ many }) => ({
  users: many(usersToSocials),
}));

export const usersToSocials = pgTable(
  "users_to_socials",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    socialId: integer("social_id")
      .notNull()
      .references(() => users.id),
    username: text("username").notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
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

export const festivalStatusEnum = pgEnum("festival_status", [
  "draft",
  "published",
  "active",
  "archived",
]);
export const festivals = pgTable(
  "festivals",
  {
    id: serial("id").primaryKey(),
    name: text("name").unique().notNull(),
    description: text("description"),
    startDate: timestamp("start_date").notNull(),
    status: festivalStatusEnum("status").default("draft").notNull(),
    endDate: timestamp("end_date").notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (festivals) => ({
    nameIdx: index("name_idx").on(festivals.name),
  }),
);
export const festivalsRelations = relations(festivals, ({ many }) => ({
  participationRequests: many(participationRequests),
}));

export const requestStatusEnum = pgEnum("participation_request_status", [
  "pending",
  "accepted",
  "rejected",
]);
export const participationRequests = pgTable(
  "participation_requests",
  {
    id: serial("id").primaryKey(),
    festivalId: integer("festival_id")
      .notNull()
      .references(() => festivals.id),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    status: requestStatusEnum("status").default("pending").notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (participationRequests) => ({
    unique: index("unique").on(
      participationRequests.festivalId,
      participationRequests.userId,
    ),
  }),
);
export const particiPationRequestsRelations = relations(
  participationRequests,
  ({ one }) => ({
    user: one(users, {
      fields: [participationRequests.userId],
      references: [users.id],
    }),
    festival: one(festivals, {
      fields: [participationRequests.festivalId],
      references: [festivals.id],
    }),
  }),
);

export const requestTypeEnum = pgEnum("user_request_type", [
  "become_artist",
  "festival_participation",
]);
export const userRequests = pgTable("user_requests", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  festivalId: integer("festival_id").references(() => festivals.id),
  type: requestTypeEnum("type").notNull().default("become_artist"),
  status: requestStatusEnum("status"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
