import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  real,
  serial,
  smallint,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { number } from "zod";

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
  "new_artist",
]);
export const userStatusEnum = pgEnum("user_status", [
  "verified",
  "pending",
  "rejected",
  "banned",
]);
export const genderEnum = pgEnum("gender", [
  "male",
  "female",
  "non_binary",
  "other",
  "undisclosed",
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
    status: userStatusEnum("status").default("pending").notNull(),
    gender: genderEnum("gender").default("undisclosed").notNull(),
    state: text("state"),
    verifiedAt: timestamp("verified_at"),
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
  scheduledTasks: many(scheduledTasks),
  invoices: many(invoices),
  profileTags: many(profileTags),
  profileSubcategories: many(profileSubcategories),
}));

export const tags = pgTable("tags", {
  id: serial("id").primaryKey(),
  label: text("name").notNull(),
  category: userCategoryEnum("category").default("none").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const tagsRelations = relations(tags, ({ many }) => ({
  profileTags: many(profileTags),
}));

export const profileTags = pgTable("profile_tags", {
  id: serial("id").primaryKey(),
  profileId: integer("profile_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tagId: integer("tag_id")
    .notNull()
    .references(() => tags.id, { onDelete: "cascade" }),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const profileTagsRelations = relations(profileTags, ({ one }) => ({
  profile: one(users, {
    fields: [profileTags.profileId],
    references: [users.id],
  }),
  tag: one(tags, {
    fields: [profileTags.tagId],
    references: [tags.id],
  }),
}));

export const subcategories = pgTable("subcategories", {
  id: serial("id").primaryKey(),
  label: text("name").notNull(),
  descrption: text("description"),
  category: userCategoryEnum("category").notNull().default("none"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const subcategoriesRelations = relations(subcategories, ({ many }) => ({
  profileSubcategories: many(profileSubcategories),
}));

export const profileSubcategories = pgTable("profile_subcategories", {
  id: serial("id").primaryKey(),
  profileId: integer("profile_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  subcategoryId: integer("subcategory_id")
    .notNull()
    .references(() => subcategories.id, { onDelete: "cascade" }),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const profileSubcategoriesRelations = relations(
  profileSubcategories,
  ({ one }) => ({
    profile: one(users, {
      fields: [profileSubcategories.profileId],
      references: [users.id],
    }),
    subcategory: one(subcategories, {
      fields: [profileSubcategories.subcategoryId],
      references: [subcategories.id],
    }),
  }),
);

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
export const festivalTypeEnum = pgEnum("festival_type", [
  "glitter",
  "twinkler",
  "festicker",
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
    startDate: timestamp("start_date"),
    status: festivalStatusEnum("status").default("draft").notNull(),
    endDate: timestamp("end_date"),
    mapsVersion: festivalMapVersionEnum("maps_version").default("v1").notNull(),
    publicRegistration: boolean("public_registration").default(false).notNull(),
    eventDayRegistration: boolean("event_day_registration")
      .default(false)
      .notNull(),
    reservationsStartDate: timestamp("reservations_start_date")
      .defaultNow()
      .notNull(),
    generalMapUrl: text("general_map_url"),
    mascotUrl: text("mascot_url"),
    festivalType: festivalTypeEnum("festival_type")
      .default("glitter")
      .notNull(),
    illustrationPaymentQrCodeUrl: text("illustration_payment_qr_code_url"),
    gastronomyPaymentQrCodeUrl: text("gastronomy_payment_qr_code_url"),
    entrepreneurshipPaymentQrCodeUrl: text(
      "entrepreneurship_payment_qr_code_url",
    ),
    illustrationStandUrl: text("illustration_stand_url"),
    gastronomyStandUrl: text("gastronomy_stand_url"),
    entrepreneurshipStandUrl: text("entrepreneurship_stand_url"),
    festivalCode: text("festival_code"),
    festivalBannerUrl: text("festival_banner_url"),
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
  festivalSectors: many(festivalSectors),
  festivalDates: many(festivalDates),
  festivalActivities: many(festivalActivities),
}));

export const festivalSectors = pgTable(
  "festival_sectors",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    mapUrl: text("map_url"),
    festivalId: integer("festival_id")
      .notNull()
      .references(() => festivals.id),
    orderInFestival: smallint("order_in_festival").notNull().default(1),
    mascotUrl: text("mascot_url"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (festivalSectors) => ({
    festivalSectorNameIdx: index("festival_sector_name_idx").on(
      festivalSectors.name,
    ),
  }),
);
export const festivalSectorsRelations = relations(
  festivalSectors,
  ({ many, one }) => ({
    festival: one(festivals, {
      fields: [festivalSectors.festivalId],
      references: [festivals.id],
    }),
    stands: many(stands),
  }),
);

export const festivalDates = pgTable(
  "festival_dates",
  {
    id: serial("id").primaryKey(),
    festivalId: integer("festival_id")
      .notNull()
      .references(() => festivals.id),
    startDate: timestamp("start_date").notNull(),
    endDate: timestamp("end_date").notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (festivalDates) => ({
    festivalDatesFestivalIdIdx: index("festival_dates_festival_id_idx").on(
      festivalDates.festivalId,
    ),
  }),
);
export const festivalDatesRelations = relations(festivalDates, ({ one }) => ({
  festival: one(festivals, {
    fields: [festivalDates.festivalId],
    references: [festivals.id],
  }),
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
    festivalId: integer("festival_id"),
    festivalSectorId: integer("festival_sector_id").references(
      () => festivalSectors.id,
    ),
    qrCodeId: integer("qr_code_id").references(() => qrCodes.id),
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
  festivalSector: one(festivalSectors, {
    fields: [stands.festivalSectorId],
    references: [festivalSectors.id],
  }),
  qrCode: one(qrCodes, {
    fields: [stands.qrCodeId],
    references: [qrCodes.id],
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
    scheduledTasks: many(scheduledTasks),
  }),
);

export const reservationParticipants = pgTable("participations", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  reservationId: integer("reservation_id")
    .notNull()
    .references(() => standReservations.id, { onDelete: "cascade" }),
  hasStamp: boolean("has_stamp").default(false).notNull(),
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
  qrcode: text("qr_code"),
  qrcodeUrl: text("qr_code_url"),
  visitorId: integer("visitor_id").notNull(),
  isEventDayCreation: boolean("is_event_day_creation").default(false).notNull(),
  festivalId: integer("festival_id").notNull(),
  numberOfVisitors: integer("number_of_visitors").default(1).notNull(),
  ticketNumber: integer("ticket_number"),
  checkedInAt: timestamp("checked_in_at"),
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

export const scheduledTaskTypeEnum = pgEnum("scheduled_task_type", [
  "profile_creation",
  "stand_reservation",
]);
export const scheduledTasks = pgTable("scheduled_tasks", {
  id: serial("id").primaryKey(),
  taskType: scheduledTaskTypeEnum("task_type")
    .default("profile_creation")
    .notNull(),
  dueDate: timestamp("due_date").notNull(),
  completedAt: timestamp("completed_at"),
  reminderTime: timestamp("reminder_time").notNull(),
  reminderSentAt: timestamp("reminder_sent_at"),
  profileId: integer("profile_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  reservationId: integer("reservation_id").references(
    () => standReservations.id,
    { onDelete: "cascade" },
  ),
  ranAfterDueDate: boolean("ran_after_due_date").default(false).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const scheduledTasksRelations = relations(scheduledTasks, ({ one }) => ({
  profile: one(users, {
    fields: [scheduledTasks.profileId],
    references: [users.id],
  }),
  reservation: one(standReservations, {
    fields: [scheduledTasks.reservationId],
    references: [standReservations.id],
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

export const qrCodes = pgTable("qr_codes", {
  id: serial("id").primaryKey(),
  qrCodeUrl: text("qr_code_url").notNull(),
  amount: real("amount").notNull(),
  expirationDate: timestamp("expiration_date").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const qrCodesRelations = relations(qrCodes, ({ many }) => ({
  stands: many(stands),
}));

export const festivalActivities = pgTable("festival_activities", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  registrationStartDate: timestamp("registration_start_date").notNull(),
  registrationEndDate: timestamp("registration_end_date").notNull(),
  festivalId: integer("festival_id")
    .references(() => festivals.id, { onDelete: "cascade" })
    .notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const festivalActivitiesRelations = relations(
  festivalActivities,
  ({ one, many }) => ({
    festival: one(festivals, {
      fields: [festivalActivities.festivalId],
      references: [festivals.id],
    }),
    details: many(festivalActivityDetails),
  }),
);

export const festivalActivityDetails = pgTable("festival_activity_details", {
  id: serial("id").primaryKey(),
  description: text("description"),
  imageUrl: text("image_url"),
  participantionLimit: integer("participantion_limit"),
  activityId: integer("activity_id")
    .notNull()
    .references(() => festivalActivities.id, { onDelete: "cascade" }),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const festivalActivityDetailsRelations = relations(
  festivalActivityDetails,
  ({ one, many }) => ({
    festivalActivity: one(festivalActivities, {
      fields: [festivalActivityDetails.activityId],
      references: [festivalActivities.id],
    }),
    participants: many(festivalActivityParticipants),
  }),
);

export const festivalActivityParticipants = pgTable(
  "festival_activity_participants",
  {
    id: serial("id").primaryKey(),
    detailsId: integer("details_id")
      .notNull()
      .references(() => festivalActivityDetails.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
);
export const festivalActivityParticipantsRelations = relations(
  festivalActivityParticipants,
  ({ one }) => ({
    activityDetail: one(festivalActivityDetails, {
      fields: [festivalActivityParticipants.detailsId],
      references: [festivalActivityDetails.id],
    }),
    user: one(users, {
      fields: [festivalActivityParticipants.userId],
      references: [users.id],
    }),
  }),
);
