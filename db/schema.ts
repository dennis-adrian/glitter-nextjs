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
  userRequests: many(userRequests),
  userSocials: many(userSocials),
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
  userRequests: many(userRequests),
}));

export const requestStatusEnum = pgEnum("participation_request_status", [
  "pending",
  "accepted",
  "rejected",
]);

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
  status: requestStatusEnum("status").default("pending").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const userRequestsRelations = relations(userRequests, ({ one }) => ({
  user: one(users, {
    fields: [userRequests.userId],
    references: [users.id],
  }),
  festival: one(festivals, {
    fields: [userRequests.festivalId],
    references: [festivals.id],
  }),
}));

export const userSocialTypeEnum = pgEnum("user_social_type", [
  "instagram",
  "facebook",
  "tiktok",
  "twitter",
  "youtube",
]);
export const userSocials = pgTable("user_socials", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  type: userSocialTypeEnum("type").notNull(),
  username: text("username").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const userSocialsRelations = relations(userSocials, ({ one }) => ({
  user: one(users, {
    fields: [userSocials.userId],
    references: [users.id],
  }),
}));
