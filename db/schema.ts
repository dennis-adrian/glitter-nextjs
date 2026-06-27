import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  real,
  serial,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
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
export const participationTypeEnum = pgEnum("participation_type", [
  "standard",
  "live_activity",
]);
export const liveActCategoryEnum = pgEnum("live_act_category", [
  "music",
  "dance",
  "talk",
]);
export const liveActStatusEnum = pgEnum("live_act_status", [
  "pending",
  "backlog",
  "approved",
  "rejected",
]);
export const marketingBannerAudienceEnum = pgEnum("marketing_banner_audience", [
  "all",
  "public_only",
  "participants_only",
]);
export const storeStatusModeEnum = pgEnum("store_status_mode", [
  "auto",
  "open",
  "closed",
]);
export const storeSectionEnum = pgEnum("store_section", ["merch", "supplies"]);

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
    country: text("country").default("BO").notNull(),
    verifiedAt: timestamp("verified_at"),
    shouldSubmitProducts: boolean("should_submit_products")
      .default(false)
      .notNull(),
    participationType: participationTypeEnum("participation_type")
      .default("standard")
      .notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (users) => [index("display_name_idx").on(users.displayName)],
);
export const usersRelations = relations(users, ({ many }) => ({
  userRequests: many(userRequests),
  userSocials: many(userSocials),
  participations: many(reservationParticipants),
  createdExternalParticipants: many(externalParticipants),
  scheduledTasks: many(scheduledTasks),
  invoices: many(invoices),
  profileTags: many(profileTags),
  profileSubcategories: many(profileSubcategories),
  userBadges: many(userBadges),
  infractions: many(infractions),
  participantProducts: many(participantProducts),
  festivalActivityVotes: many(festivalActivityVotes),
  standHolds: many(standHolds),
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
  standSubcategories: many(standSubcategories),
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
    keepStoreOpen: boolean("keep_store_open").default(false).notNull(),
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
    termsAndConditionsUrl: text("terms_and_conditions_url"),
    thumbnailUrl: text("thumbnail_url"),
    posterUrl: text("poster_url"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (festivals) => [index("name_idx").on(festivals.name)],
);
export const festivalsRelations = relations(festivals, ({ many, one }) => ({
  userRequests: many(userRequests),
  standReservations: many(standReservations),
  stands: many(stands),
  tickets: many(tickets),
  festivalSectors: many(festivalSectors),
  festivalDates: many(festivalDates),
  festivalActivities: many(festivalActivities),
  badge: one(badges),
  infractions: many(infractions),
}));

export const marketingBanners = pgTable(
  "marketing_banners",
  {
    id: serial("id").primaryKey(),
    /** Desktop / large screens (required) — 4:1 style art */
    imageUrl: text("image_url").notNull(),
    imageUrlTablet: text("image_url_tablet"),
    imageUrlMobile: text("image_url_mobile"),
    href: text("href").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    isVisible: boolean("is_visible").default(true).notNull(),
    audience: marketingBannerAudienceEnum("audience").default("all").notNull(),
    openInNewTab: boolean("open_in_new_tab").default(false).notNull(),
    label: text("label"),
    altText: text("alt_text"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("marketing_banners_sort_order_idx").on(t.sortOrder),
    index("marketing_banners_is_visible_idx").on(t.isVisible),
  ],
);

/**
 * Per-section store configuration (one row per `section`: merch / supplies).
 * The storefront reads `mode` to decide whether to override the festival-based
 * auto-close for that section (see store-gate.ts): `auto` keeps the festival
 * behavior, `open` forces the section open, `closed` forces it closed and shows
 * the optional custom title/message to visitors.
 */
export const storeSettings = pgTable("store_settings", {
  id: serial("id").primaryKey(),
  section: storeSectionEnum("section").notNull().unique(),
  mode: storeStatusModeEnum("mode").default("auto").notNull(),
  closedTitle: text("closed_title"),
  closedMessage: text("closed_message"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const festivalSectors = pgTable(
  "festival_sectors",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    mapUrl: text("map_url"),
    festivalId: integer("festival_id")
      .notNull()
      .references(() => festivals.id, { onDelete: "cascade" }),
    orderInFestival: smallint("order_in_festival").notNull().default(1),
    mascotUrl: text("mascot_url"),
    mapOriginX: real("map_origin_x"),
    mapOriginY: real("map_origin_y"),
    mapWidth: real("map_width"),
    mapHeight: real("map_height"),
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
    mapElements: many(mapElements),
  }),
);

export const festivalDates = pgTable(
  "festival_dates",
  {
    id: serial("id").primaryKey(),
    festivalId: integer("festival_id")
      .notNull()
      .references(() => festivals.id, { onDelete: "cascade" }),
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
export const festivalDatesRelations = relations(
  festivalDates,
  ({ one, many }) => ({
    festival: one(festivals, {
      fields: [festivalDates.festivalId],
      references: [festivals.id],
    }),
    collaboratorsAttendanceLogs: many(collaboratorsAttendanceLogs),
  }),
);

export const requestStatusEnum = pgEnum("participation_request_status", [
  "pending",
  "accepted",
  "rejected",
]);
export const reservationStatusEnum = pgEnum("reservation_status", [
  "pending",
  "verification_payment",
  "accepted",
  "rejected",
]);
export const reservationSourceEnum = pgEnum("reservation_source", [
  "user_reservation",
  "admin_assignment",
]);
export const externalParticipantTypeEnum = pgEnum("external_participant_type", [
  "institution",
  "social_organization",
  "sponsor",
  "partner",
  "public_entity",
  "invited_brand",
  "other",
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
  "held",
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
    participationType: participationTypeEnum("participation_type")
      .default("standard")
      .notNull(),
    festivalId: integer("festival_id"),
    festivalSectorId: integer("festival_sector_id").references(
      () => festivalSectors.id,
      { onDelete: "cascade" },
    ),
    qrCodeId: integer("qr_code_id").references(() => qrCodes.id),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (stands) => [index("stand_label_idx").on(stands.label)],
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
  festivalActivityVotes: many(festivalActivityVotes),
  holds: many(standHolds),
  standSubcategories: many(standSubcategories),
}));

export const standSubcategories = pgTable("stand_subcategories", {
  id: serial("id").primaryKey(),
  standId: integer("stand_id")
    .notNull()
    .references(() => stands.id, { onDelete: "cascade" }),
  subcategoryId: integer("subcategory_id")
    .notNull()
    .references(() => subcategories.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const standSubcategoriesRelations = relations(
  standSubcategories,
  ({ one }) => ({
    stand: one(stands, {
      fields: [standSubcategories.standId],
      references: [stands.id],
    }),
    subcategory: one(subcategories, {
      fields: [standSubcategories.subcategoryId],
      references: [subcategories.id],
    }),
  }),
);

export const standHolds = pgTable(
  "stand_holds",
  {
    id: serial("id").primaryKey(),
    standId: integer("stand_id")
      .notNull()
      .references(() => stands.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    festivalId: integer("festival_id")
      .notNull()
      .references(() => festivals.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at").notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (standHolds) => [
    index("stand_holds_stand_idx").on(standHolds.standId),
    index("stand_holds_user_festival_idx").on(
      standHolds.userId,
      standHolds.festivalId,
    ),
  ],
);
export const standHoldsRelations = relations(standHolds, ({ one }) => ({
  stand: one(stands, {
    fields: [standHolds.standId],
    references: [stands.id],
  }),
  user: one(users, {
    fields: [standHolds.userId],
    references: [users.id],
  }),
  festival: one(festivals, {
    fields: [standHolds.festivalId],
    references: [festivals.id],
  }),
}));

export const standReservations = pgTable(
  "stand_reservations",
  {
    id: serial("id").primaryKey(),
    standId: integer("stand_id")
      .notNull()
      .references(() => stands.id),
    festivalId: integer("festival_id").notNull(),
    status: reservationStatusEnum("status").default("pending").notNull(),
    source: reservationSourceEnum("source")
      .default("user_reservation")
      .notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("stand_reservations_id_festival_id_unique").on(
      t.id,
      t.festivalId,
    ),
  ],
);
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
    externalParticipants: many(reservationExternalParticipants),
    invoices: many(invoices),
    scheduledTasks: many(scheduledTasks),
    collaborators: many(reservationCollaborators),
    participantProducts: many(participantProducts),
  }),
);

export const reservationParticipants = pgTable(
  "participations",
  {
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
  },
  (table) => [
    unique("participations_user_reservation_unique").on(
      table.userId,
      table.reservationId,
    ),
  ],
);
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

export const externalParticipants = pgTable(
  "external_participants",
  {
    id: serial("id").primaryKey(),
    displayName: text("display_name").notNull(),
    type: externalParticipantTypeEnum("type").notNull(),
    customCategoryLabel: text("custom_category_label"),
    description: text("description"),
    imageUrl: text("image_url"),
    websiteUrl: text("website_url"),
    instagramUrl: text("instagram_url"),
    contactEmail: text("contact_email"),
    contactPhone: text("contact_phone"),
    createdByUserId: integer("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (externalParticipants) => [
    index("external_participants_display_name_idx").on(
      externalParticipants.displayName,
    ),
  ],
);
export const externalParticipantsRelations = relations(
  externalParticipants,
  ({ one, many }) => ({
    createdByUser: one(users, {
      fields: [externalParticipants.createdByUserId],
      references: [users.id],
    }),
    reservations: many(reservationExternalParticipants),
  }),
);

export const reservationExternalParticipants = pgTable(
  "reservation_external_participants",
  {
    id: serial("id").primaryKey(),
    externalParticipantId: integer("external_participant_id")
      .notNull()
      .references(() => externalParticipants.id, { onDelete: "cascade" }),
    reservationId: integer("reservation_id")
      .notNull()
      .references(() => standReservations.id, { onDelete: "cascade" }),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (reservationExternalParticipants) => [
    index("reservation_external_participants_reservation_id_idx").on(
      reservationExternalParticipants.reservationId,
    ),
    unique("reservation_external_participants_unique").on(
      reservationExternalParticipants.externalParticipantId,
      reservationExternalParticipants.reservationId,
    ),
  ],
);
export const reservationExternalParticipantsRelations = relations(
  reservationExternalParticipants,
  ({ one }) => ({
    externalParticipant: one(externalParticipants, {
      fields: [reservationExternalParticipants.externalParticipantId],
      references: [externalParticipants.id],
    }),
    reservation: one(standReservations, {
      fields: [reservationExternalParticipants.reservationId],
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
  originalAmount: real("original_amount").default(0).notNull(),
  discountAmount: real("discount_amount").default(0).notNull(),
  amount: real("amount").notNull(),
  date: timestamp("date").notNull(),
  status: invoiceStatusEnum("status").default("pending").notNull(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  reservationId: integer("reservation_id")
    .notNull()
    .references(() => standReservations.id, { onDelete: "cascade" }),
  discountCodeId: integer("discount_code_id").references(
    () => discountCodes.id,
    { onDelete: "set null" },
  ),
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
  discountCode: one(discountCodes, {
    fields: [invoices.discountCodeId],
    references: [discountCodes.id],
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

export const festivalActivityTypeEnum = pgEnum("festival_activity_type", [
  "stamp_passport",
  "sticker_print",
  "best_stand",
  "festival_sticker",
  "coupon_book",
  "sticker_hunt",
]);

export const proofTypeEnum = pgEnum("proof_type", ["image", "text", "both"]);

export const proofStatusEnum = pgEnum("proof_status", [
  "pending_review",
  "approved",
  "rejected_resubmit",
  "rejected_removed",
]);

export const accessLevelEnum = pgEnum("access_level", [
  "public",
  "festival_participants_only",
]);

export const festivalActivities = pgTable(
  "festival_activities",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    registrationStartDate: timestamp("registration_start_date").notNull(),
    registrationEndDate: timestamp("registration_end_date").notNull(),
    promotionalArtUrl: text("promotional_art_url"),
    festivalId: integer("festival_id")
      .references(() => festivals.id, { onDelete: "cascade" })
      .notNull(),
    visitorsDescription: text("visitors_description"),
    type: festivalActivityTypeEnum("type").default("stamp_passport").notNull(),
    activityPrizeUrl: text("activity_prize_url"),
    allowsVoting: boolean("allows_voting").default(false).notNull(),
    votingStartDate: timestamp("voting_start_date"),
    votingEndDate: timestamp("voting_end_date"),
    proofType: proofTypeEnum("proof_type"),
    proofUploadLimitDate: timestamp("proof_upload_limit_date"),
    accessLevel: accessLevelEnum("access_level").default("public").notNull(),
    waitlistWindowMinutes: integer("waitlist_window_minutes"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    check(
      "proof_upload_limit_required",
      sql`(${t.proofType} IS NULL) OR (${t.proofUploadLimitDate} IS NOT NULL)`,
    ),
    check(
      "festival_activities_waitlist_window_minutes_positive",
      sql`${t.waitlistWindowMinutes} IS NULL OR ${t.waitlistWindowMinutes} > 0`,
    ),
  ],
);
export const festivalActivitiesRelations = relations(
  festivalActivities,
  ({ one, many }) => ({
    festival: one(festivals, {
      fields: [festivalActivities.festivalId],
      references: [festivals.id],
    }),
    details: many(festivalActivityDetails),
    waitlistEntries: many(festivalActivityWaitlist),
  }),
);

export const festivalActivityDetails = pgTable("festival_activity_details", {
  id: serial("id").primaryKey(),
  description: text("description"),
  imageUrl: text("image_url"),
  couponBookHeaderImageUrl: text("coupon_book_header_image_url"),
  participationLimit: integer("participation_limit"),
  activityId: integer("activity_id")
    .notNull()
    .references(() => festivalActivities.id, { onDelete: "cascade" }),
  category: userCategoryEnum("category"),
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
    votes: many(festivalActivityVotes),
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
    removedAt: timestamp("removed_at"),
    removalReason: text("removal_reason"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [unique().on(table.detailsId, table.userId)],
);
export const festivalActivityParticipantsRelations = relations(
  festivalActivityParticipants,
  ({ one, many }) => ({
    activityDetail: one(festivalActivityDetails, {
      fields: [festivalActivityParticipants.detailsId],
      references: [festivalActivityDetails.id],
    }),
    user: one(users, {
      fields: [festivalActivityParticipants.userId],
      references: [users.id],
    }),
    proofs: many(festivalActivityParticipantProofs),
    // Note: Votes are now polymorphic. Query votes with:
    // votableType = 'participant' AND votableId = festivalActivityParticipants.id
  }),
);

export const festivalActivityParticipantProofs = pgTable(
  "festival_activity_participant_proofs",
  {
    id: serial("id").primaryKey(),
    imageUrl: text("image_url"),
    participationId: integer("participation_id")
      .notNull()
      .references(() => festivalActivityParticipants.id, {
        onDelete: "cascade",
      }),
    promoHighlight: text("promo_highlight"),
    promoDescription: text("promo_description"),
    promoConditions: text("promo_conditions"),
    proofStatus: proofStatusEnum("proof_status")
      .default("pending_review")
      .notNull(),
    adminFeedback: text("admin_feedback"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
);
export const festivalActivityParticipantProofsRelations = relations(
  festivalActivityParticipantProofs,
  ({ one }) => ({
    participation: one(festivalActivityParticipants, {
      fields: [festivalActivityParticipantProofs.participationId],
      references: [festivalActivityParticipants.id],
    }),
  }),
);

export const festivalActivityCouponBookConfigs = pgTable(
  "festival_activity_coupon_book_configs",
  {
    id: serial("id").primaryKey(),
    activityId: integer("activity_id")
      .notNull()
      .references(() => festivalActivities.id, { onDelete: "cascade" })
      .unique(),
    // Validated at write time via CouponBookDraftSchema (coupon-book-draft-schema.ts).
    payload: jsonb("payload").notNull(),
    revision: integer("revision").default(1).notNull(),
    createdByUserId: integer("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedByUserId: integer("updated_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    check(
      "festival_activity_coupon_book_configs_revision_positive",
      sql`${t.revision} >= 1`,
    ),
  ],
);

export const festivalActivityCouponBookConfigsRelations = relations(
  festivalActivityCouponBookConfigs,
  ({ one }) => ({
    activity: one(festivalActivities, {
      fields: [festivalActivityCouponBookConfigs.activityId],
      references: [festivalActivities.id],
    }),
    createdBy: one(users, {
      fields: [festivalActivityCouponBookConfigs.createdByUserId],
      references: [users.id],
    }),
    updatedBy: one(users, {
      fields: [festivalActivityCouponBookConfigs.updatedByUserId],
      references: [users.id],
    }),
  }),
);

export const couponBookPrintSessions = pgTable(
  "coupon_book_print_sessions",
  {
    id: text("id").primaryKey(),
    payload: jsonb("payload").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("coupon_book_print_sessions_expires_at_idx").on(t.expiresAt)],
);

export const votableTypeEnum = pgEnum("votable_type", ["participant", "stand"]);

export const festivalActivityVotes = pgTable(
  "festival_activity_votes",
  {
    id: serial("id").primaryKey(),
    voterId: integer("voter_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    activityVariantId: integer("activity_variant_id")
      .notNull()
      .references(() => festivalActivityDetails.id, { onDelete: "cascade" }),
    votableType: votableTypeEnum("votable_type")
      .notNull()
      .default("participant"),
    standId: integer("stand_id").references(() => stands.id, {
      onDelete: "cascade",
    }),
    participantId: integer("participant_id").references(
      () => festivalActivityParticipants.id,
      { onDelete: "cascade" },
    ),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (festivalActivityVotes) => [
    // Constraint ensures exactly one of the FKs is present in PostgreSQL
    sql`CHECK (
			num_nonnulls(stand_id, participant_id) = 1
			)`,
    unique("unique_voter_activity").on(
      festivalActivityVotes.voterId,
      festivalActivityVotes.activityVariantId,
    ),
  ],
);
export const festivalActivityVotesRelations = relations(
  festivalActivityVotes,
  ({ one }) => ({
    voter: one(users, {
      fields: [festivalActivityVotes.voterId],
      references: [users.id],
    }),
    activityVariant: one(festivalActivityDetails, {
      fields: [festivalActivityVotes.activityVariantId],
      references: [festivalActivityDetails.id],
    }),
    stand: one(stands, {
      fields: [festivalActivityVotes.standId],
      references: [stands.id],
    }),
    participant: one(festivalActivityParticipants, {
      fields: [festivalActivityVotes.participantId],
      references: [festivalActivityParticipants.id],
    }),
  }),
);

export const festivalActivityWaitlist = pgTable(
  "festival_activity_waitlist",
  {
    id: serial("id").primaryKey(),
    activityId: integer("activity_id")
      .notNull()
      .references(() => festivalActivities.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    notifiedAt: timestamp("notified_at"),
    expiresAt: timestamp("expires_at"),
    notifiedForDetailId: integer("notified_for_detail_id").references(
      () => festivalActivityDetails.id,
    ),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    unique().on(table.activityId, table.userId),
    unique().on(table.activityId, table.position),
    check(
      "festival_activity_waitlist_position_check",
      sql`${table.position} > 0`,
    ),
  ],
);
export const festivalActivityWaitlistRelations = relations(
  festivalActivityWaitlist,
  ({ one }) => ({
    activity: one(festivalActivities, {
      fields: [festivalActivityWaitlist.activityId],
      references: [festivalActivities.id],
    }),
    user: one(users, {
      fields: [festivalActivityWaitlist.userId],
      references: [users.id],
    }),
    notifiedForDetail: one(festivalActivityDetails, {
      fields: [festivalActivityWaitlist.notifiedForDetailId],
      references: [festivalActivityDetails.id],
    }),
  }),
);

export const collaborators = pgTable("collaborators", {
  id: serial("id").primaryKey(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  identificationNumber: text("identification_number").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const collaboratorsRelations = relations(collaborators, ({ many }) => ({
  reservationCollaborators: many(reservationCollaborators),
}));

export const reservationCollaborators = pgTable("reservation_collaborators", {
  id: serial("id").primaryKey(),
  reservationId: integer("reservation_id")
    .notNull()
    .references(() => standReservations.id, { onDelete: "cascade" }),
  collaboratorId: integer("collaborator_id")
    .notNull()
    .references(() => collaborators.id, { onDelete: "cascade" }),
  arrivedAt: timestamp("arrived_at"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const reservationCollaboratorsRelations = relations(
  reservationCollaborators,
  ({ one, many }) => ({
    reservation: one(standReservations, {
      fields: [reservationCollaborators.reservationId],
      references: [standReservations.id],
    }),
    collaborator: one(collaborators, {
      fields: [reservationCollaborators.collaboratorId],
      references: [collaborators.id],
    }),
    collaboratorsAttendanceLogs: many(collaboratorsAttendanceLogs),
  }),
);

export const collaboratorsAttendanceLogs = pgTable(
  "collaborators_attendance_logs",
  {
    id: serial("id").primaryKey(),
    reservationCollaboratorId: integer("reservation_collaborator_id")
      .notNull()
      .references(() => reservationCollaborators.id, {
        onDelete: "cascade",
      }),
    festivalDateId: integer("festival_date_id")
      .notNull()
      .references(() => festivalDates.id, { onDelete: "cascade" }),
    arrivedAt: timestamp("arrived_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
);
export const collaboratorsAttendanceLogsRelations = relations(
  collaboratorsAttendanceLogs,
  ({ one }) => ({
    reservationCollaborator: one(reservationCollaborators, {
      fields: [collaboratorsAttendanceLogs.reservationCollaboratorId],
      references: [reservationCollaborators.id],
    }),
    festivalDate: one(festivalDates, {
      fields: [collaboratorsAttendanceLogs.festivalDateId],
      references: [festivalDates.id],
    }),
  }),
);

export const badges = pgTable("badges", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  imageUrl: text("image_url"),
  festivalId: integer("festival_id").references(() => festivals.id, {
    onDelete: "cascade",
  }),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const badgesRelations = relations(badges, ({ one, many }) => ({
  festival: one(festivals, {
    fields: [badges.festivalId],
    references: [festivals.id],
  }),
  userBadges: many(userBadges),
}));

export const userBadges = pgTable("user_badges", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, {
      onDelete: "cascade",
    }),
  badgeId: integer("badge_id")
    .notNull()
    .references(() => badges.id, {
      onDelete: "cascade",
    }),
  awardedAt: timestamp("awarded_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const userBadgesRelations = relations(userBadges, ({ one }) => ({
  user: one(users, {
    fields: [userBadges.userId],
    references: [users.id],
  }),
  badge: one(badges, {
    fields: [userBadges.badgeId],
    references: [badges.id],
  }),
}));

export const discountUnitEnum = pgEnum("discount_unit", [
  "percentage",
  "amount",
]);

export const productStatusEnum = pgEnum("product_status", [
  "available",
  "presale",
  "sale",
]);

export const productOptionSelectorDisplayEnum = pgEnum(
  "product_option_selector_display",
  ["dropdown", "image", "button"],
);

export const productTransactionTypeEnum = pgEnum("product_transaction_type", [
  "purchase",
  "rental",
]);
export const productStoreCategoryEnum = pgEnum("product_store_category", [
  "merch",
  "supplies",
]);
export const productRentalStockModeEnum = pgEnum("product_rental_stock_mode", [
  "shared",
  "separate",
]);
export const productContentSectionFormatEnum = pgEnum(
  "product_content_section_format",
  ["free_text", "bullet_list"],
);
export const productContentSectionDisplayContextEnum = pgEnum(
  "product_content_section_display_context",
  ["all", "purchase", "rental"],
);
export const rentalReturnConditionEnum = pgEnum("rental_return_condition", [
  "good",
  "damaged",
  "missing_parts",
  "lost",
  "other",
]);

export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  /** Public store URL segment; unique, hyphenated from name with -2,-3 suffixes on collision */
  slug: text("slug").notNull().unique(),
  description: text("description"),
  price: real("price").notNull(),
  stock: integer("stock").default(0),
  imageUrl: text("image_url"),
  isNew: boolean("is_new").default(true).notNull(),
  isFeatured: boolean("is_featured").default(false).notNull(),
  isVisible: boolean("is_visible").default(true).notNull(),
  storeCategory: productStoreCategoryEnum("store_category")
    .default("merch")
    .notNull(),
  availableDate: timestamp("available_date"),
  discount: real("discount").default(0),
  discountUnit: discountUnitEnum("discount_unit")
    .default("percentage")
    .notNull(),
  status: productStatusEnum("status").default("available").notNull(),
  isPurchasable: boolean("is_purchasable").default(true).notNull(),
  isRentable: boolean("is_rentable").default(false).notNull(),
  rentalPrice: real("rental_price"),
  rentalStockMode: productRentalStockModeEnum("rental_stock_mode")
    .default("shared")
    .notNull(),
  rentalStock: integer("rental_stock"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const productsRelations = relations(products, ({ many }) => ({
  options: many(productOptions),
  variants: many(productVariants),
  orderItems: many(orderItems),
  images: many(productImages),
  cartItems: many(cartItems),
  contentSections: many(productContentSections),
}));

export const productOptions = pgTable(
  "product_options",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    selectorDisplay: productOptionSelectorDisplayEnum("selector_display")
      .default("dropdown")
      .notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("product_options_product_id_idx").on(t.productId),
    uniqueIndex("product_options_id_product_id_unique").on(t.id, t.productId),
    unique("product_options_product_name_unique").on(t.productId, t.name),
  ],
);

export const productOptionsRelations = relations(
  productOptions,
  ({ one, many }) => ({
    product: one(products, {
      fields: [productOptions.productId],
      references: [products.id],
    }),
    values: many(productOptionValues),
    variantSelections: many(productVariantOptionValues),
  }),
);

export const productOptionValues = pgTable(
  "product_option_values",
  {
    id: serial("id").primaryKey(),
    optionId: integer("option_id")
      .notNull()
      .references(() => productOptions.id, { onDelete: "cascade" }),
    value: text("value").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("product_option_values_option_id_idx").on(t.optionId),
    uniqueIndex("product_option_values_option_id_id_unique").on(
      t.optionId,
      t.id,
    ),
    unique("product_option_values_option_value_unique").on(t.optionId, t.value),
  ],
);

export const productOptionValuesRelations = relations(
  productOptionValues,
  ({ one, many }) => ({
    option: one(productOptions, {
      fields: [productOptionValues.optionId],
      references: [productOptions.id],
    }),
    variantSelections: many(productVariantOptionValues),
  }),
);

export const productVariants = pgTable(
  "product_variants",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    price: real("price"),
    stock: integer("stock").notNull().default(0),
    rentalStock: integer("rental_stock"),
    imageUrl: text("image_url"),
    isVisible: boolean("is_visible").default(true).notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("product_variants_product_id_idx").on(t.productId),
    index("product_variants_visible_idx").on(t.isVisible),
    uniqueIndex("product_variants_id_product_id_unique").on(t.id, t.productId),
  ],
);

export const productVariantsRelations = relations(
  productVariants,
  ({ one, many }) => ({
    product: one(products, {
      fields: [productVariants.productId],
      references: [products.id],
    }),
    selections: many(productVariantOptionValues),
    orderItems: many(orderItems),
    cartItems: many(cartItems),
  }),
);

export const productVariantOptionValues = pgTable(
  "product_variant_option_values",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    variantId: integer("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "cascade" }),
    optionId: integer("option_id")
      .notNull()
      .references(() => productOptions.id, { onDelete: "cascade" }),
    optionValueId: integer("option_value_id")
      .notNull()
      .references(() => productOptionValues.id, { onDelete: "cascade" }),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("product_variant_option_values_product_id_idx").on(t.productId),
    index("product_variant_option_values_variant_id_idx").on(t.variantId),
    index("product_variant_option_values_option_id_idx").on(t.optionId),
    index("product_variant_option_values_option_value_id_idx").on(
      t.optionValueId,
    ),
    unique("product_variant_option_unique").on(t.variantId, t.optionId),
    unique("product_variant_option_value_unique").on(
      t.variantId,
      t.optionValueId,
    ),
    foreignKey({
      name: "product_variant_option_values_option_value_pair_fk",
      columns: [t.optionId, t.optionValueId],
      foreignColumns: [productOptionValues.optionId, productOptionValues.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "product_variant_option_values_variant_product_fk",
      columns: [t.variantId, t.productId],
      foreignColumns: [productVariants.id, productVariants.productId],
    }).onDelete("cascade"),
    foreignKey({
      name: "product_variant_option_values_option_product_fk",
      columns: [t.optionId, t.productId],
      foreignColumns: [productOptions.id, productOptions.productId],
    }).onDelete("cascade"),
  ],
);

export const productVariantOptionValuesRelations = relations(
  productVariantOptionValues,
  ({ one }) => ({
    variant: one(productVariants, {
      fields: [productVariantOptionValues.variantId],
      references: [productVariants.id],
    }),
    product: one(products, {
      fields: [productVariantOptionValues.productId],
      references: [products.id],
    }),
    option: one(productOptions, {
      fields: [productVariantOptionValues.optionId],
      references: [productOptions.id],
    }),
    optionValue: one(productOptionValues, {
      fields: [productVariantOptionValues.optionValueId],
      references: [productOptionValues.id],
    }),
  }),
);

export const orderStatusEnum = pgEnum("order_status", [
  /** Initial state when an order is first created but not yet processed/accepted */
  "pending",
  /** User has uploaded payment voucher; waiting for admin confirmation */
  "payment_verification",
  /** Order is currently being processed (legacy value, kept for backwards compat) */
  "processing",
  /** Order has been successfully paid for */
  "paid",
  /** Customer has received the order */
  "delivered",
  /** Order was cancelled either by the user or system */
  "cancelled",
]);
export const orders = pgTable(
  "orders",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    // Guest order fields (populated when userId is null)
    guestName: text("guest_name"),
    guestEmail: text("guest_email"),
    guestPhone: text("guest_phone"),
    guestOrderToken: text("guest_order_token").unique(),
    orderDate: timestamp("order_date").defaultNow(),
    status: orderStatusEnum("status").default("pending").notNull(),
    totalAmount: numeric("total_amount", {
      precision: 10,
      scale: 2,
      mode: "number",
    }).notNull(),
    paymentVoucherUrl: text("payment_voucher_url"),
    voucherSubmittedAt: timestamp("voucher_submitted_at"),
    paymentDueDate: timestamp("payment_due_date")
      .notNull()
      .default(sql`now() + interval '2 days'`),
    paymentReminder1SentAt: timestamp("payment_reminder1_sent_at"),
    paymentReminder2SentAt: timestamp("payment_reminder2_sent_at"),
    paymentReminder3SentAt: timestamp("payment_reminder3_sent_at"),
    paymentReminder1ClaimedAt: timestamp("payment_reminder1_claimed_at"),
    paymentReminder2ClaimedAt: timestamp("payment_reminder2_claimed_at"),
    paymentReminder3ClaimedAt: timestamp("payment_reminder3_claimed_at"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    check(
      "orders_identity_check",
      sql`(
				(${t.userId} IS NOT NULL AND ${t.guestName} IS NULL AND ${t.guestEmail} IS NULL AND ${t.guestPhone} IS NULL AND ${t.guestOrderToken} IS NULL)
				OR
				(${t.userId} IS NULL AND length(trim(${t.guestName})) > 0 AND length(trim(${t.guestEmail})) > 0 AND length(trim(${t.guestPhone})) > 0 AND length(trim(${t.guestOrderToken})) > 0)
			)`,
    ),
  ],
);
export const ordersRelations = relations(orders, ({ many, one }) => ({
  orderItems: many(orderItems),
  customer: one(users, {
    fields: [orders.userId],
    references: [users.id],
  }),
}));

export const orderItems = pgTable(
  "order_items",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    productVariantId: integer("product_variant_id"),
    productVariantLabel: text("product_variant_label"),
    quantity: integer("quantity").notNull(),
    priceAtPurchase: real("price_at_purchase").notNull(),
    transactionType: productTransactionTypeEnum("transaction_type")
      .default("purchase")
      .notNull(),
    rentalContentSectionsSnapshot: jsonb("rental_content_sections_snapshot"),
    rentalStockModeSnapshot: productRentalStockModeEnum(
      "rental_stock_mode_snapshot",
    ),
    rentalFestivalId: integer("rental_festival_id"),
    rentalReservationId: integer("rental_reservation_id"),
    rentalReturnedQuantity: integer("rental_returned_quantity")
      .default(0)
      .notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("order_items_order_id_idx").on(t.orderId),
    index("order_items_product_id_idx").on(t.productId),
    foreignKey({
      name: "order_items_product_variant_product_fk",
      columns: [t.productVariantId, t.productId],
      foreignColumns: [productVariants.id, productVariants.productId],
    }).onDelete("restrict"),
    foreignKey({
      name: "order_items_rental_reservation_festival_fk",
      columns: [t.rentalReservationId, t.rentalFestivalId],
      foreignColumns: [standReservations.id, standReservations.festivalId],
    }).onDelete("restrict"),
    check(
      "order_items_rental_context_required",
      sql`(
        ${t.transactionType} != 'rental'
        AND ${t.rentalContentSectionsSnapshot} IS NULL
        AND ${t.rentalStockModeSnapshot} IS NULL
        AND ${t.rentalFestivalId} IS NULL
        AND ${t.rentalReservationId} IS NULL
        AND ${t.rentalReturnedQuantity} = 0
      ) OR (
        ${t.transactionType} = 'rental'
        AND ${t.rentalFestivalId} IS NOT NULL
        AND ${t.rentalReservationId} IS NOT NULL
        AND ${t.rentalStockModeSnapshot} IS NOT NULL
      )`,
    ),
    check(
      "order_items_rental_returned_quantity_valid",
      sql`${t.rentalReturnedQuantity} >= 0 AND ${t.rentalReturnedQuantity} <= ${t.quantity}`,
    ),
  ],
);
export const orderItemsRelations = relations(orderItems, ({ one, many }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
  product: one(products, {
    fields: [orderItems.productId],
    references: [products.id],
  }),
  variant: one(productVariants, {
    fields: [orderItems.productVariantId],
    references: [productVariants.id],
  }),
  rentalFestival: one(festivals, {
    fields: [orderItems.rentalFestivalId],
    references: [festivals.id],
  }),
  rentalReservation: one(standReservations, {
    fields: [orderItems.rentalReservationId],
    references: [standReservations.id],
  }),
  rentalReturnLogs: many(rentalReturnLogs),
}));

export const carts = pgTable("carts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export const cartsRelations = relations(carts, ({ one, many }) => ({
  user: one(users, { fields: [carts.userId], references: [users.id] }),
  items: many(cartItems),
}));

export const cartItems = pgTable(
  "cart_items",
  {
    id: serial("id").primaryKey(),
    cartId: integer("cart_id")
      .notNull()
      .references(() => carts.id, { onDelete: "cascade" }),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    productVariantId: integer("product_variant_id"),
    quantity: integer("quantity").notNull().default(1),
    transactionType: productTransactionTypeEnum("transaction_type")
      .default("purchase")
      .notNull(),
    rentalFestivalId: integer("rental_festival_id"),
    rentalReservationId: integer("rental_reservation_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("cart_items_cart_id_idx").on(t.cartId),
    index("cart_items_product_id_idx").on(t.productId),
    index("cart_items_product_variant_id_idx").on(t.productVariantId),
    index("cart_items_rental_festival_id_idx").on(t.rentalFestivalId),
    index("cart_items_rental_reservation_id_idx").on(t.rentalReservationId),
    uniqueIndex("cart_items_cart_product_base_unique")
      .on(
        t.cartId,
        t.productId,
        t.transactionType,
        t.rentalFestivalId,
        t.rentalReservationId,
      )
      .where(
        sql`${t.productVariantId} IS NULL AND ${t.rentalFestivalId} IS NOT NULL AND ${t.rentalReservationId} IS NOT NULL`,
      ),
    uniqueIndex("cart_items_cart_product_base_purchase_unique")
      .on(t.cartId, t.productId, t.transactionType)
      .where(
        sql`${t.productVariantId} IS NULL AND ${t.rentalFestivalId} IS NULL AND ${t.rentalReservationId} IS NULL`,
      ),
    uniqueIndex("cart_items_cart_product_variant_unique")
      .on(
        t.cartId,
        t.productId,
        t.productVariantId,
        t.transactionType,
        t.rentalFestivalId,
        t.rentalReservationId,
      )
      .where(
        sql`${t.productVariantId} IS NOT NULL AND ${t.rentalFestivalId} IS NOT NULL AND ${t.rentalReservationId} IS NOT NULL`,
      ),
    uniqueIndex("cart_items_cart_product_variant_purchase_unique")
      .on(t.cartId, t.productId, t.productVariantId, t.transactionType)
      .where(
        sql`${t.productVariantId} IS NOT NULL AND ${t.rentalFestivalId} IS NULL AND ${t.rentalReservationId} IS NULL`,
      ),
    foreignKey({
      name: "cart_items_product_variant_product_fk",
      columns: [t.productVariantId, t.productId],
      foreignColumns: [productVariants.id, productVariants.productId],
    }).onDelete("cascade"),
    foreignKey({
      name: "cart_items_rental_reservation_festival_fk",
      columns: [t.rentalReservationId, t.rentalFestivalId],
      foreignColumns: [standReservations.id, standReservations.festivalId],
    }).onDelete("restrict"),
    check("cart_items_quantity_positive", sql`${t.quantity} > 0`),
    check(
      "cart_items_rental_context_required",
      sql`(
        ${t.transactionType} != 'rental'
        AND ${t.rentalFestivalId} IS NULL
        AND ${t.rentalReservationId} IS NULL
      ) OR (
        ${t.transactionType} = 'rental'
        AND ${t.rentalFestivalId} IS NOT NULL
        AND ${t.rentalReservationId} IS NOT NULL
      )`,
    ),
  ],
);
export const cartItemsRelations = relations(cartItems, ({ one }) => ({
  cart: one(carts, { fields: [cartItems.cartId], references: [carts.id] }),
  product: one(products, {
    fields: [cartItems.productId],
    references: [products.id],
  }),
  variant: one(productVariants, {
    fields: [cartItems.productVariantId],
    references: [productVariants.id],
  }),
  rentalFestival: one(festivals, {
    fields: [cartItems.rentalFestivalId],
    references: [festivals.id],
  }),
  rentalReservation: one(standReservations, {
    fields: [cartItems.rentalReservationId],
    references: [standReservations.id],
  }),
}));

export const infractionSeverityEnum = pgEnum("infraction_severity", [
  "low", // Minor issue, may result in a warning or soft sanction
  "medium", // Moderate issue, typically requires a follow-up
  "high", // Serious violation, likely leads to a strict sanction
  "critical", // Severe breach, usually results in a ban or multiple sanctions
]);

export const infractionTypes = pgTable("infraction_types", {
  id: serial("id").primaryKey(),
  code: text("code").unique().notNull(), // e.g. 'no_show'
  label: text("label").notNull(), // e.g. 'No Show'
  description: text("description"), // e.g. Full explanation of the infraction
  severity: infractionSeverityEnum("severity").default("low").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const infractionTypesRelations = relations(
  infractionTypes,
  ({ many }) => ({
    infractions: many(infractions),
  }),
);

export const infractions = pgTable("infractions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  typeId: integer("type_id")
    .notNull()
    .references(() => infractionTypes.id, { onDelete: "cascade" }),
  festivalId: integer("festival_id").references(() => festivals.id, {
    onDelete: "cascade",
  }),
  description: text("description"), // e.g. Full explanation of the infraction
  handled: boolean("handled").default(false).notNull(), // Whether an admin has reviewed the infraction
  userGaveNotice: boolean("user_gave_notice").default(false).notNull(),
  gaveNoticeAt: timestamp("gave_notice_at"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const infractionsRelations = relations(infractions, ({ one, many }) => ({
  user: one(users, {
    fields: [infractions.userId],
    references: [users.id],
  }),
  type: one(infractionTypes, {
    fields: [infractions.typeId],
    references: [infractionTypes.id],
  }),
  festival: one(festivals, {
    fields: [infractions.festivalId],
    references: [festivals.id],
  }),
  sanctions: many(sanctions),
}));

export const sanctionTypeEnum = pgEnum("sanction_type", [
  "ban",
  "warning",
  "reservation_delay",
]);

export const durationUnitEnum = pgEnum("duration_unit", [
  "minutes",
  "hours",
  "days",
  "months",
  "years",
  "festivals",
  "indefinitely",
]);

export const sanctions = pgTable("sanctions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  infractionId: integer("infraction_id")
    .notNull()
    .references(() => infractions.id, { onDelete: "cascade" }),
  type: sanctionTypeEnum("type").notNull(),
  description: text("description"), // e.g. Custom explanation or extra instructions
  duration: integer("duration"), // e.g. 2 festivals, 10 days, 1 month, 1 year
  durationUnit: durationUnitEnum("duration_unit")
    .default("indefinitely")
    .notNull(),
  active: boolean("active").default(true).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const sanctionsRelations = relations(sanctions, ({ one }) => ({
  user: one(users, {
    fields: [sanctions.userId],
    references: [users.id],
  }),
  infraction: one(infractions, {
    fields: [sanctions.infractionId],
    references: [infractions.id],
  }),
}));

export const submissionStatusEnum = pgEnum("submission_status", [
  "pending_review",
  "approved",
  "rejected",
]);
export const participantProducts = pgTable("participant_products", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  participationId: integer("participation_id")
    .notNull()
    .references(() => reservationParticipants.id, {
      onDelete: "cascade",
    }),
  imageUrl: text("image_url").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  submissionStatus: submissionStatusEnum("submission_status")
    .default("pending_review")
    .notNull(),
  submissionFeedback: text("submission_feedback"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const participantProductsRelations = relations(
  participantProducts,
  ({ one }) => ({
    user: one(users, {
      fields: [participantProducts.userId],
      references: [users.id],
    }),
    participation: one(reservationParticipants, {
      fields: [participantProducts.participationId],
      references: [reservationParticipants.id],
    }),
  }),
);

export const productImageUploadStatusEnum = pgEnum(
  "product_image_upload_status",
  ["pending", "active"],
);

export const productImages = pgTable(
  "product_images",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id").references(() => products.id, {
      onDelete: "cascade",
    }),
    uploadStatus: productImageUploadStatusEnum("upload_status")
      .default("pending")
      .notNull(),
    imageUrl: text("image_url").notNull(),
    description: text("description"),
    isMain: boolean("is_main").default(false).notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (productImages) => [
    index("product_images_product_id_idx").on(productImages.productId),
  ],
);
export const productImagesRelations = relations(productImages, ({ one }) => ({
  product: one(products, {
    fields: [productImages.productId],
    references: [products.id],
  }),
}));

export const productContentSections = pgTable(
  "product_content_sections",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    productVariantId: integer("product_variant_id"),
    title: text("title").notNull(),
    format: productContentSectionFormatEnum("format").notNull(),
    body: text("body"),
    items: jsonb("items").$type<string[]>(),
    displayContext: productContentSectionDisplayContextEnum("display_context")
      .default("all")
      .notNull(),
    isVisible: boolean("is_visible").default(true).notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("product_content_sections_product_id_idx").on(t.productId),
    index("product_content_sections_variant_id_idx").on(t.productVariantId),
    index("product_content_sections_product_sort_idx").on(
      t.productId,
      t.productVariantId,
      t.sortOrder,
    ),
    foreignKey({
      name: "product_content_sections_product_variant_product_fk",
      columns: [t.productVariantId, t.productId],
      foreignColumns: [productVariants.id, productVariants.productId],
    }).onDelete("cascade"),
  ],
);

export const productContentSectionsRelations = relations(
  productContentSections,
  ({ one }) => ({
    product: one(products, {
      fields: [productContentSections.productId],
      references: [products.id],
    }),
    variant: one(productVariants, {
      fields: [productContentSections.productVariantId],
      references: [productVariants.id],
    }),
  }),
);

export const rentalReturnLogs = pgTable(
  "rental_return_logs",
  {
    id: serial("id").primaryKey(),
    orderItemId: integer("order_item_id")
      .notNull()
      .references(() => orderItems.id, { onDelete: "restrict" }),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    productVariantId: integer("product_variant_id"),
    quantityReturned: integer("quantity_returned").notNull(),
    conditionStatus: rentalReturnConditionEnum("condition_status").notNull(),
    notes: text("notes"),
    stockRestored: integer("stock_restored").notNull(),
    stockPool: productRentalStockModeEnum("stock_pool").notNull(),
    processedByUserId: integer("processed_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    previousReturnedQuantity: integer("previous_returned_quantity"),
    newReturnedQuantity: integer("new_returned_quantity"),
    productNameSnapshot: text("product_name_snapshot"),
    variantLabelSnapshot: text("variant_label_snapshot"),
    customerNameSnapshot: text("customer_name_snapshot"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("rental_return_logs_order_item_id_idx").on(t.orderItemId),
    index("rental_return_logs_order_id_idx").on(t.orderId),
    index("rental_return_logs_product_id_idx").on(t.productId),
    index("rental_return_logs_created_at_idx").on(t.createdAt),
    check(
      "rental_return_logs_quantity_positive",
      sql`${t.quantityReturned} > 0`,
    ),
    check(
      "rental_return_logs_stock_restored_non_negative",
      sql`${t.stockRestored} >= 0`,
    ),
    check(
      "rental_return_logs_stock_restored_lte_quantity",
      sql`${t.stockRestored} <= ${t.quantityReturned}`,
    ),
    foreignKey({
      name: "rental_return_logs_product_variant_product_fk",
      columns: [t.productVariantId, t.productId],
      foreignColumns: [productVariants.id, productVariants.productId],
    }).onDelete("restrict"),
  ],
);

export const rentalReturnLogsRelations = relations(
  rentalReturnLogs,
  ({ one }) => ({
    orderItem: one(orderItems, {
      fields: [rentalReturnLogs.orderItemId],
      references: [orderItems.id],
    }),
    order: one(orders, {
      fields: [rentalReturnLogs.orderId],
      references: [orders.id],
    }),
    product: one(products, {
      fields: [rentalReturnLogs.productId],
      references: [products.id],
    }),
    variant: one(productVariants, {
      fields: [rentalReturnLogs.productVariantId],
      references: [productVariants.id],
    }),
    processedBy: one(users, {
      fields: [rentalReturnLogs.processedByUserId],
      references: [users.id],
    }),
  }),
);

// Map Elements - signaling elements on festival maps (entrances, stages, etc.)
export const mapElementTypeEnum = pgEnum("map_element_type", [
  "entrance",
  "stage",
  "door",
  "bathroom",
  "label",
  "custom",
  "stairs",
]);
export const mapElementLabelPositionEnum = pgEnum(
  "map_element_label_position",
  ["left", "right", "top", "bottom"],
);
export const mapElements = pgTable(
  "map_elements",
  {
    id: serial("id").primaryKey(),
    type: mapElementTypeEnum("type").notNull(),
    label: text("label"),
    labelPosition: mapElementLabelPositionEnum("label_position")
      .notNull()
      .default("bottom"),
    labelFontSize: real("label_font_size").notNull().default(2),
    labelFontWeight: real("label_font_weight").notNull().default(500),
    showIcon: boolean("show_icon").notNull().default(true),
    positionLeft: real("position_left").notNull().default(0),
    positionTop: real("position_top").notNull().default(0),
    width: real("width").notNull().default(8),
    height: real("height").notNull().default(8),
    rotation: real("rotation").notNull().default(0),
    festivalSectorId: integer("festival_sector_id")
      .notNull()
      .references(() => festivalSectors.id, { onDelete: "cascade" }),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (mapElements) => [
    index("map_elements_sector_idx").on(mapElements.festivalSectorId),
  ],
);
export const mapElementsRelations = relations(mapElements, ({ one }) => ({
  festivalSector: one(festivalSectors, {
    fields: [mapElements.festivalSectorId],
    references: [festivalSectors.id],
  }),
}));

// Map Templates - for reusable festival map layouts
export const mapTemplates = pgTable("map_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  templateData: jsonb("template_data").notNull(),
  createdByUserId: integer("created_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  createdFromFestivalId: integer("created_from_festival_id").references(
    () => festivals.id,
    { onDelete: "set null" },
  ),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const mapTemplatesRelations = relations(mapTemplates, ({ one }) => ({
  createdBy: one(users, {
    fields: [mapTemplates.createdByUserId],
    references: [users.id],
  }),
  createdFromFestival: one(festivals, {
    fields: [mapTemplates.createdFromFestivalId],
    references: [festivals.id],
  }),
}));

export const discountCodes = pgTable("discount_codes", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  discountUnit: discountUnitEnum("discount_unit")
    .default("percentage")
    .notNull(),
  discountValue: real("discount_value").notNull(),
  maxUses: integer("max_uses"),
  currentUses: integer("current_uses").default(0).notNull(),
  festivalId: integer("festival_id").references(() => festivals.id, {
    onDelete: "set null",
  }),
  userId: integer("user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  expiresAt: timestamp("expires_at").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const discountCodesRelations = relations(
  discountCodes,
  ({ one, many }) => ({
    festival: one(festivals, {
      fields: [discountCodes.festivalId],
      references: [festivals.id],
    }),
    user: one(users, {
      fields: [discountCodes.userId],
      references: [users.id],
    }),
    invoices: many(invoices),
  }),
);

export const liveActs = pgTable("live_acts", {
  id: serial("id").primaryKey(),
  actName: text("act_name").notNull(),
  category: liveActCategoryEnum("category").notNull(),
  description: text("description"),
  resourceLink: text("resource_link"),
  socialLinks: jsonb("social_links").$type<string[]>().default([]),
  contactName: text("contact_name").notNull(),
  contactEmail: text("contact_email").notNull(),
  contactPhone: text("contact_phone").notNull(),
  status: liveActStatusEnum("status").default("pending").notNull(),
  adminNotes: text("admin_notes"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
