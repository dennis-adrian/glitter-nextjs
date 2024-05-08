import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  real,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", [
  "admin",
  "artist",
  "user",
  "festival_admin",
]);
export const userCategoryEnum = pgEnum("user_category", [
  "none",
  "illustration",
  "gastronomy",
  "entrepreneurship",
]);
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
    category: userCategoryEnum("category").default("none").notNull(),
    verified: boolean("verified").default(false).notNull(),
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
  participations: many(reservationParticipants),
  profileTasks: many(profileTasks),
  invoices: many(invoices),
}));

export const festivalStatusEnum = pgEnum("festival_status", [
  "draft",
  "published",
  "active",
  "archived",
]);
export const festivalMapVersionEnum = pgEnum("festival_map_version", [
  "v1",
  "v2",
  "v3",
]);
export const festivals = pgTable(
  "festivals",
  {
    id: serial("id").primaryKey(),
    name: text("name").unique().notNull(),
    description: text("description"),
    address: text("address"),
    locationLabel: text("location_label"),
    locationUrl: text("location_url"),
    startDate: timestamp("start_date").notNull(),
    status: festivalStatusEnum("status").default("draft").notNull(),
    endDate: timestamp("end_date").notNull(),
    mapsVersion: festivalMapVersionEnum("maps_version").default("v1").notNull(),
    publicRegistration: boolean("public_registration").default(false).notNull(),
    eventDayRegistration: boolean("event_day_registration")
      .default(false)
      .notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (festivals) => ({
    nameIdx: index("name_idx").on(festivals.name),
  }),
);
export const festivalsRelations = relations(festivals, ({ many }) => ({
  userRequests: many(userRequests),
  standReservations: many(standReservations),
  stands: many(stands),
  tickets: many(tickets),
}));

export const requestStatusEnum = pgEnum("participation_request_status", [
  "pending",
  "accepted",
  "rejected",
]);

export const requestTypeEnum = pgEnum("user_request_type", [
  "festival_participation",
  "become_artist",
]);
export const userRequests = pgTable("user_requests", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
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
    .references(() => users.id, { onDelete: "cascade" }),
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

export const standStatusEnum = pgEnum("stand_status", [
  "available",
  "reserved",
  "confirmed",
  "disabled",
]);
export const standOrientationEnum = pgEnum("stand_orientation", [
  "portrait",
  "landscape",
]);
export const standZoneEnum = pgEnum("stand_zone", ["main", "secondary"]);
export const stands = pgTable(
  "stands",
  {
    id: serial("id").primaryKey(),
    label: text("label"),
    status: standStatusEnum("status").default("available").notNull(),
    orientation: standOrientationEnum("orientation")
      .default("landscape")
      .notNull(),
    standNumber: integer("stand_number").notNull(),
    standCategory: userCategoryEnum("stand_category")
      .default("illustration")
      .notNull(),
    zone: standZoneEnum("zone").default("main").notNull(),
    width: real("width"),
    height: real("height"),
    positionLeft: real("position_left"),
    positionTop: real("position_top"),
    price: real("price").notNull().default(0),
    festivalId: integer("festival_id").notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (stands) => ({
    nameIdx: index("stand_label_idx").on(stands.label),
  }),
);
export const standRelations = relations(stands, ({ many, one }) => ({
  reservations: many(standReservations),
  festival: one(festivals, {
    fields: [stands.festivalId],
    references: [festivals.id],
  }),
}));

export const standReservations = pgTable("stand_reservations", {
  id: serial("id").primaryKey(),
  standId: integer("stand_id").notNull(),
  festivalId: integer("festival_id").notNull(),
  status: requestStatusEnum("status").default("pending").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const standReservationsRelations = relations(
  standReservations,
  ({ one, many }) => ({
    stand: one(stands, {
      fields: [standReservations.standId],
      references: [stands.id],
    }),
    festival: one(festivals, {
      fields: [standReservations.festivalId],
      references: [festivals.id],
    }),
    participants: many(reservationParticipants),
    invoices: many(invoices),
  }),
);

export const reservationParticipants = pgTable("participations", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  reservationId: integer("reservation_id").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const participationsRelations = relations(
  reservationParticipants,
  ({ one }) => ({
    user: one(users, {
      fields: [reservationParticipants.userId],
      references: [users.id],
    }),
    reservation: one(standReservations, {
      fields: [reservationParticipants.reservationId],
      references: [standReservations.id],
    }),
  }),
);

export const eventDiscoveryEnum = pgEnum("event_discovery", [
  "facebook",
  "instagram",
  "tiktok",
  "cba",
  "friends",
  "participant_invitation",
  "casual",
  "la_rota",
  "other",
]);
export const genderEnum = pgEnum("gender", [
  "male",
  "female",
  "non_binary",
  "other",
  "undisclosed",
]);
export const visitors = pgTable("visitors", {
  id: serial("id").primaryKey(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  email: text("email").unique().notNull(),
  phoneNumber: text("phone_number").notNull(),
  eventDiscovery: eventDiscoveryEnum("event_discovery")
    .notNull()
    .default("other"),
  gender: genderEnum("gender").notNull().default("undisclosed"),
  birthdate: timestamp("birthdate").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const visitorsRelations = relations(visitors, ({ many }) => ({
  tickets: many(tickets),
}));

export const ticketStatusEnum = pgEnum("ticket_status", [
  "pending",
  "checked_in",
]);
export const tickets = pgTable("tickets", {
  id: serial("id").primaryKey(),
  date: timestamp("date").notNull(),
  status: ticketStatusEnum("status").default("pending").notNull(),
  qrcode: text("qr_code").notNull(),
  qrcodeUrl: text("qr_code_url").notNull(),
  visitorId: integer("visitor_id").notNull(),
  festivalId: integer("festival_id").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const ticketRelations = relations(tickets, ({ one }) => ({
  visitor: one(visitors, {
    fields: [tickets.visitorId],
    references: [visitors.id],
  }),
  festival: one(festivals, {
    fields: [tickets.festivalId],
    references: [festivals.id],
  }),
}));

export const profileTaskTypeEnum = pgEnum("profile_task_type", [
  "profile_creation",
]);
export const profileTasks = pgTable("profile_tasks", {
  id: serial("id").primaryKey(),
  taskType: profileTaskTypeEnum("task_type").notNull(),
  dueDate: timestamp("due_date").notNull(),
  completedAt: timestamp("completed_at"),
  reminderTime: timestamp("reminder_time").notNull(),
  reminderSentAt: timestamp("reminder_sent_at"),
  profileId: integer("profile_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const profileTasksRelations = relations(profileTasks, ({ one }) => ({
  profile: one(users, {
    fields: [profileTasks.profileId],
    references: [users.id],
  }),
}));

export const invoiceStatusEnum = pgEnum("invoice_status", [
  "pending",
  "paid",
  "cancelled",
]);
export const invoices = pgTable("invoices", {
  id: serial("id").primaryKey(),
  amount: real("amount").notNull(),
  date: timestamp("date").notNull(),
  status: invoiceStatusEnum("status").default("pending").notNull(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  reservationId: integer("reservation_id")
    .notNull()
    .references(() => standReservations.id, { onDelete: "cascade" }),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  user: one(users, {
    fields: [invoices.userId],
    references: [users.id],
  }),
  reservation: one(standReservations, {
    fields: [invoices.reservationId],
    references: [standReservations.id],
  }),
  payments: many(payments),
}));

export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  amount: real("amount").notNull(),
  date: timestamp("date").notNull(),
  invoiceId: integer("invoice_id")
    .notNull()
    .references(() => invoices.id, { onDelete: "cascade" }),
  voucherUrl: text("voucher_url").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const paymentsRelations = relations(payments, ({ one }) => ({
  invoice: one(invoices, {
    fields: [payments.invoiceId],
    references: [invoices.id],
  }),
}));
