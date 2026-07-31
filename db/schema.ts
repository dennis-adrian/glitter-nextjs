import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
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
  "paused",
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

/**
 * Durable outbox for profile deletions that cross Clerk + local DB.
 * If Clerk succeeds and the local delete fails, rows with
 * `clerkDeletedAt` set and `localDeletedAt` null can be reconciled.
 */
export const pendingUserDeletions = pgTable(
  "pending_user_deletions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    clerkId: text("clerk_id").notNull(),
    clerkDeletedAt: timestamp("clerk_deleted_at"),
    localDeletedAt: timestamp("local_deleted_at"),
    lastError: text("last_error"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("pending_user_deletions_clerk_id_idx").on(t.clerkId),
    index("pending_user_deletions_reconcile_idx").on(
      t.clerkDeletedAt,
      t.localDeletedAt,
    ),
  ],
);

export const userStatusEvents = pgTable("user_status_events", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  fromStatus: userStatusEnum("from_status").notNull(),
  toStatus: userStatusEnum("to_status").notNull(),
  reason: text("reason"),
  createdByUserId: integer("created_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const userStatusEventsRelations = relations(
  userStatusEvents,
  ({ one }) => ({
    user: one(users, {
      fields: [userStatusEvents.userId],
      references: [users.id],
      relationName: "targetUserStatusEvents",
    }),
    createdBy: one(users, {
      fields: [userStatusEvents.createdByUserId],
      references: [users.id],
      relationName: "createdUserStatusEvents",
    }),
  }),
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
  sanctions: many(sanctions),
  createdSanctions: many(sanctions, {
    relationName: "createdSanctions",
  }),
  approvedSanctions: many(sanctions, {
    relationName: "approvedSanctions",
  }),
  revokedSanctions: many(sanctions, {
    relationName: "revokedSanctions",
  }),
  participantProducts: many(participantProducts),
  festivalActivityVotes: many(festivalActivityVotes),
  standHolds: many(standHolds),
  statusEvents: many(userStatusEvents, {
    relationName: "targetUserStatusEvents",
  }),
  createdStatusEvents: many(userStatusEvents, {
    relationName: "createdUserStatusEvents",
  }),
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
  statusEvents: many(festivalStatusEvents),
  sanctionFestivals: many(sanctionFestivals),
}));

export const festivalStatusEvents = pgTable(
  "festival_status_events",
  {
    id: serial("id").primaryKey(),
    festivalId: integer("festival_id")
      .notNull()
      .references(() => festivals.id, { onDelete: "restrict" }),
    fromStatus: festivalStatusEnum("from_status"),
    toStatus: festivalStatusEnum("to_status").notNull(),
    actorUserId: integer("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("festival_status_events_festival_id_created_at_idx").on(
      table.festivalId,
      table.createdAt,
    ),
  ],
);
export const festivalStatusEventsRelations = relations(
  festivalStatusEvents,
  ({ one }) => ({
    festival: one(festivals, {
      fields: [festivalStatusEvents.festivalId],
      references: [festivals.id],
    }),
    actor: one(users, {
      fields: [festivalStatusEvents.actorUserId],
      references: [users.id],
    }),
  }),
);

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
  (stands) => [
    index("stand_label_idx").on(stands.label),
    index("stands_festival_sector_id_idx").on(stands.festivalSectorId),
  ],
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
    // When set and in the future, the reservation is hidden from participants:
    // the stand appears "available" and participant identity is withheld until
    // this moment. null means the reservation is visible immediately.
    revealAt: timestamp("reveal_at"),
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

export const storageCleanupJobStatusEnum = pgEnum(
  "storage_cleanup_job_status",
  ["pending", "processing", "completed", "failed"],
);
/**
 * Generic UploadThing cleanup outbox. Provenance is polymorphic
 * (`entityType` + `entityId`) so any file-owning domain can enqueue deletes
 * without per-entity foreign keys.
 *
 * Consumers claim jobs into `processing` with a lease before calling UploadThing;
 * only the claimant may complete/retry. Retries use `nextAttemptAt` backoff;
 * exhausted retries move to terminal `failed`.
 */
export const storageCleanupJobs = pgTable(
  "storage_cleanup_jobs",
  {
    id: serial("id").primaryKey(),
    entityType: text("entity_type").notNull(),
    entityId: integer("entity_id"),
    fileUrl: text("file_url").notNull(),
    status: storageCleanupJobStatusEnum("status").default("pending").notNull(),
    lastError: text("last_error"),
    attempts: integer("attempts").default(0).notNull(),
    nextAttemptAt: timestamp("next_attempt_at").defaultNow().notNull(),
    leaseOwner: text("lease_owner"),
    leaseExpiresAt: timestamp("lease_expires_at"),
    completedAt: timestamp("completed_at"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("storage_cleanup_jobs_status_next_attempt_idx").on(
      t.status,
      t.nextAttemptAt,
    ),
    index("storage_cleanup_jobs_entity_idx").on(t.entityType, t.entityId),
  ],
);

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

export const infractionStatusEnum = pgEnum("infraction_status", [
  "pending",
  "under_review",
  "resolved",
  "voided",
]);

export const infractionEventTypeEnum = pgEnum("infraction_event_type", [
  "created",
  "edited",
  "review_started",
  "resolved",
  "voided",
  "reopened",
  "sanction_linked",
  "duplicate_confirmed",
]);

export const infractionTypes = pgTable(
  "infraction_types",
  {
    id: serial("id").primaryKey(),
    code: text("code").unique().notNull(), // e.g. 'no_show'
    label: text("label").notNull(), // e.g. 'No Show'
    description: text("description"), // e.g. Full explanation of the infraction
    severity: infractionSeverityEnum("severity").default("low").notNull(),
    active: boolean("active").default(true).notNull(),
    archivedAt: timestamp("archived_at"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("infraction_types_label_unique").on(sql`lower(${table.label})`),
    index("infraction_types_active_label_idx").on(table.active, table.label),
    check(
      "infraction_types_archive_state_check",
      sql`
        (
          ${table.active} = true
          AND ${table.archivedAt} IS NULL
        )
        OR
        (
          ${table.active} = false
          AND ${table.archivedAt} IS NOT NULL
        )
      `,
    ),
  ],
);
export const infractionTypesRelations = relations(
  infractionTypes,
  ({ many }) => ({
    infractions: many(infractions),
  }),
);

export const infractions = pgTable(
  "infractions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    typeId: integer("type_id")
      .notNull()
      .references(() => infractionTypes.id, { onDelete: "restrict" }),
    festivalId: integer("festival_id").references(() => festivals.id, {
      onDelete: "restrict",
    }),
    description: text("description"), // e.g. Full explanation of the infraction
    /** @deprecated Prefer `status`. Kept for backward-compatible migration. */
    handled: boolean("handled").default(false).notNull(),
    status: infractionStatusEnum("status").default("pending").notNull(),
    userGaveNotice: boolean("user_gave_notice").default(false).notNull(),
    gaveNoticeAt: timestamp("gave_notice_at"),
    createdByUserId: integer("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    resolvedAt: timestamp("resolved_at"),
    resolvedByUserId: integer("resolved_by_user_id").references(
      () => users.id,
      {
        onDelete: "set null",
      },
    ),
    resolutionNotes: text("resolution_notes"),
    voidedAt: timestamp("voided_at"),
    voidedByUserId: integer("voided_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    voidReason: text("void_reason"),
    idempotencyKey: text("idempotency_key").unique(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("infractions_user_id_created_at_idx").on(
      table.userId,
      table.createdAt,
    ),
    index("infractions_festival_id_created_at_idx").on(
      table.festivalId,
      table.createdAt,
    ),
    index("infractions_type_id_created_at_idx").on(
      table.typeId,
      table.createdAt,
    ),
    index("infractions_status_created_at_idx").on(
      table.status,
      table.createdAt,
    ),
    index("infractions_user_gave_notice_created_at_idx").on(
      table.userGaveNotice,
      table.createdAt,
    ),
  ],
);
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
  createdBy: one(users, {
    fields: [infractions.createdByUserId],
    references: [users.id],
    relationName: "createdInfractions",
  }),
  resolvedBy: one(users, {
    fields: [infractions.resolvedByUserId],
    references: [users.id],
    relationName: "resolvedInfractions",
  }),
  voidedBy: one(users, {
    fields: [infractions.voidedByUserId],
    references: [users.id],
    relationName: "voidedInfractions",
  }),
  /** @deprecated Prefer `sanctionLinks` (Phase 3 junction). */
  sanctions: many(sanctions),
  sanctionLinks: many(sanctionInfractions),
  events: many(infractionEvents),
  notes: many(infractionNotes),
  evidence: many(infractionEvidence),
}));

export const infractionEvents = pgTable(
  "infraction_events",
  {
    id: serial("id").primaryKey(),
    infractionId: integer("infraction_id")
      .notNull()
      .references(() => infractions.id, { onDelete: "cascade" }),
    actorUserId: integer("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    eventType: infractionEventTypeEnum("event_type").notNull(),
    fromStatus: infractionStatusEnum("from_status"),
    toStatus: infractionStatusEnum("to_status"),
    changes: jsonb("changes"),
    note: text("note"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("infraction_events_infraction_id_created_at_idx").on(
      table.infractionId,
      table.createdAt,
    ),
  ],
);
export const infractionEventsRelations = relations(
  infractionEvents,
  ({ one }) => ({
    infraction: one(infractions, {
      fields: [infractionEvents.infractionId],
      references: [infractions.id],
    }),
    actor: one(users, {
      fields: [infractionEvents.actorUserId],
      references: [users.id],
    }),
  }),
);

export const infractionNotes = pgTable(
  "infraction_notes",
  {
    id: serial("id").primaryKey(),
    infractionId: integer("infraction_id")
      .notNull()
      .references(() => infractions.id, { onDelete: "cascade" }),
    authorUserId: integer("author_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    content: text("content").notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("infraction_notes_infraction_id_created_at_idx").on(
      table.infractionId,
      table.createdAt,
    ),
  ],
);
export const infractionNotesRelations = relations(
  infractionNotes,
  ({ one }) => ({
    infraction: one(infractions, {
      fields: [infractionNotes.infractionId],
      references: [infractions.id],
    }),
    author: one(users, {
      fields: [infractionNotes.authorUserId],
      references: [users.id],
    }),
  }),
);

export const infractionEvidence = pgTable(
  "infraction_evidence",
  {
    id: serial("id").primaryKey(),
    infractionId: integer("infraction_id")
      .notNull()
      .references(() => infractions.id, { onDelete: "cascade" }),
    addedByUserId: integer("added_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    label: text("label"),
    url: text("url").notNull(),
    mimeType: text("mime_type"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("infraction_evidence_infraction_id_created_at_idx").on(
      table.infractionId,
      table.createdAt,
    ),
  ],
);
export const infractionEvidenceRelations = relations(
  infractionEvidence,
  ({ one }) => ({
    infraction: one(infractions, {
      fields: [infractionEvidence.infractionId],
      references: [infractions.id],
    }),
    addedBy: one(users, {
      fields: [infractionEvidence.addedByUserId],
      references: [users.id],
    }),
  }),
);

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

export const sanctionStatusEnum = pgEnum("sanction_status", [
  "scheduled",
  "active",
  "expired",
  "revoked",
]);

export const sanctionFestivalScopeEnum = pgEnum("sanction_festival_scope", [
  "global",
  "glitter",
  "festicker",
  "twinkler",
]);

export const sanctionEventTypeEnum = pgEnum("sanction_event_type", [
  "created",
  "approved",
  "activated",
  "edited",
  "extended",
  "scope_changed",
  "infractions_changed",
  "festival_excluded",
  "festival_restored",
  "reservation_eligibility_changed",
  "expired",
  "revoked",
]);

export const sanctions = pgTable(
  "sanctions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    /**
     * @deprecated Prefer `sanction_infractions`. Kept nullable for Phase 7 cleanup.
     * New writes still set this to the first linked infraction for backward compatibility.
     */
    infractionId: integer("infraction_id").references(() => infractions.id, {
      onDelete: "restrict",
    }),
    type: sanctionTypeEnum("type").notNull(),
    status: sanctionStatusEnum("status").default("active").notNull(),
    description: text("description"),
    festivalScope: sanctionFestivalScopeEnum("festival_scope")
      .default("global")
      .notNull(),
    validityDuration: integer("validity_duration"),
    validityUnit: durationUnitEnum("validity_unit")
      .default("indefinitely")
      .notNull(),
    startsAt: timestamp("starts_at").defaultNow().notNull(),
    endsAt: timestamp("ends_at"),
    reservationDelayMinutes: integer("reservation_delay_minutes"),
    createdByUserId: integer("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    approvedByUserId: integer("approved_by_user_id").references(
      () => users.id,
      {
        onDelete: "set null",
      },
    ),
    approvedAt: timestamp("approved_at").defaultNow().notNull(),
    revokedByUserId: integer("revoked_by_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    revokedAt: timestamp("revoked_at"),
    revocationReason: text("revocation_reason"),
    /** @deprecated Prefer `validityDuration`. */
    duration: integer("duration"),
    /** @deprecated Prefer `validityUnit`. */
    durationUnit: durationUnitEnum("duration_unit")
      .default("indefinitely")
      .notNull(),
    /** @deprecated Prefer `status`. */
    active: boolean("active").default(true).notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("sanctions_user_id_status_idx").on(table.userId, table.status),
    index("sanctions_festival_scope_status_idx").on(
      table.festivalScope,
      table.status,
    ),
    index("sanctions_ends_at_idx").on(table.endsAt),
    check(
      "sanctions_validity_configuration_check",
      sql`
        (
          ${table.validityUnit} = 'indefinitely'
          AND ${table.validityDuration} IS NULL
          AND ${table.endsAt} IS NULL
        )
        OR
        (
          ${table.validityUnit} = 'festivals'
          AND ${table.validityDuration} > 0
          AND ${table.endsAt} IS NULL
        )
        OR
        (
          ${table.validityUnit} IN ('minutes', 'hours', 'days', 'months', 'years')
          AND ${table.validityDuration} > 0
          AND ${table.endsAt} > ${table.startsAt}
        )
      `,
    ),
    check(
      "sanctions_reservation_delay_configuration_check",
      sql`
        (
          ${table.type} = 'reservation_delay'
          AND ${table.reservationDelayMinutes} > 0
        )
        OR
        (
          ${table.type} <> 'reservation_delay'
          AND ${table.reservationDelayMinutes} IS NULL
        )
      `,
    ),
    check(
      "sanctions_revocation_configuration_check",
      sql`
        (
          ${table.status} = 'revoked'
          AND ${table.revokedByUserId} IS NOT NULL
          AND ${table.revokedAt} IS NOT NULL
          AND NULLIF(BTRIM(${table.revocationReason}), '') IS NOT NULL
        )
        OR
        (
          ${table.status} <> 'revoked'
          AND ${table.revokedByUserId} IS NULL
          AND ${table.revokedAt} IS NULL
          AND ${table.revocationReason} IS NULL
        )
      `,
    ),
  ],
);
export const sanctionsRelations = relations(sanctions, ({ one, many }) => ({
  user: one(users, {
    fields: [sanctions.userId],
    references: [users.id],
  }),
  /** @deprecated Prefer `sanctionInfractions`. */
  infraction: one(infractions, {
    fields: [sanctions.infractionId],
    references: [infractions.id],
  }),
  createdBy: one(users, {
    fields: [sanctions.createdByUserId],
    references: [users.id],
    relationName: "createdSanctions",
  }),
  approvedBy: one(users, {
    fields: [sanctions.approvedByUserId],
    references: [users.id],
    relationName: "approvedSanctions",
  }),
  revokedBy: one(users, {
    fields: [sanctions.revokedByUserId],
    references: [users.id],
    relationName: "revokedSanctions",
  }),
  sanctionInfractions: many(sanctionInfractions),
  events: many(sanctionEvents),
  sanctionFestivals: many(sanctionFestivals),
}));

export const sanctionInfractions = pgTable(
  "sanction_infractions",
  {
    sanctionId: integer("sanction_id")
      .notNull()
      .references(() => sanctions.id, { onDelete: "cascade" }),
    infractionId: integer("infraction_id")
      .notNull()
      .references(() => infractions.id, { onDelete: "restrict" }),
    linkedByUserId: integer("linked_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    linkedAt: timestamp("linked_at").defaultNow().notNull(),
  },
  (table) => [
    unique().on(table.sanctionId, table.infractionId),
    uniqueIndex("sanction_infractions_infraction_id_unique").on(
      table.infractionId,
    ),
    index("sanction_infractions_sanction_id_idx").on(table.sanctionId),
  ],
);
export const sanctionInfractionsRelations = relations(
  sanctionInfractions,
  ({ one }) => ({
    sanction: one(sanctions, {
      fields: [sanctionInfractions.sanctionId],
      references: [sanctions.id],
    }),
    infraction: one(infractions, {
      fields: [sanctionInfractions.infractionId],
      references: [infractions.id],
    }),
    linkedBy: one(users, {
      fields: [sanctionInfractions.linkedByUserId],
      references: [users.id],
    }),
  }),
);

export const sanctionEvents = pgTable(
  "sanction_events",
  {
    id: serial("id").primaryKey(),
    sanctionId: integer("sanction_id")
      .notNull()
      .references(() => sanctions.id, { onDelete: "cascade" }),
    actorUserId: integer("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    eventType: sanctionEventTypeEnum("event_type").notNull(),
    fromStatus: sanctionStatusEnum("from_status"),
    toStatus: sanctionStatusEnum("to_status"),
    changes: jsonb("changes"),
    note: text("note"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("sanction_events_sanction_id_created_at_idx").on(
      table.sanctionId,
      table.createdAt,
    ),
  ],
);
export const sanctionEventsRelations = relations(sanctionEvents, ({ one }) => ({
  sanction: one(sanctions, {
    fields: [sanctionEvents.sanctionId],
    references: [sanctions.id],
  }),
  actor: one(users, {
    fields: [sanctionEvents.actorUserId],
    references: [users.id],
  }),
}));

export const sanctionFestivals = pgTable(
  "sanction_festivals",
  {
    sanctionId: integer("sanction_id")
      .notNull()
      .references(() => sanctions.id, { onDelete: "cascade" }),
    festivalId: integer("festival_id")
      .notNull()
      .references(() => festivals.id, { onDelete: "restrict" }),
    qualifiedAt: timestamp("qualified_at").notNull(),
    reservationEligibleAt: timestamp("reservation_eligible_at"),
    reservationAccessNotificationQueuedAt: timestamp(
      "reservation_access_notification_queued_at",
    ),
    countedAt: timestamp("counted_at"),
    festivalEndAt: timestamp("festival_end_at"),
    countsTowardDuration: boolean("counts_toward_duration")
      .default(true)
      .notNull(),
    excludedReason: text("excluded_reason"),
  },
  (table) => [
    unique().on(table.sanctionId, table.festivalId),
    check(
      "sanction_festivals_exclusion_reason_check",
      sql`(
        (${table.countsTowardDuration} = true AND ${table.excludedReason} IS NULL)
        OR
        (${table.countsTowardDuration} = false AND NULLIF(BTRIM(${table.excludedReason}), '') IS NOT NULL)
      )`,
    ),
    check(
      "sanction_festivals_count_snapshot_check",
      sql`(
        (${table.countedAt} IS NULL AND ${table.festivalEndAt} IS NULL)
        OR
        (${table.countedAt} IS NOT NULL AND ${table.festivalEndAt} IS NOT NULL)
      )`,
    ),
    index("sanction_festivals_sanction_id_counted_at_idx").on(
      table.sanctionId,
      table.countedAt,
    ),
    index("sanction_festivals_festival_id_idx").on(table.festivalId),
  ],
);
export const sanctionFestivalsRelations = relations(
  sanctionFestivals,
  ({ one }) => ({
    sanction: one(sanctions, {
      fields: [sanctionFestivals.sanctionId],
      references: [sanctions.id],
    }),
    festival: one(festivals, {
      fields: [sanctionFestivals.festivalId],
      references: [festivals.id],
    }),
  }),
);

export const disciplinaryNotificationJobStatusEnum = pgEnum(
  "disciplinary_notification_job_status",
  ["pending", "processing", "completed", "failed"],
);

/**
 * Durable participant-email outbox for infraction and sanction lifecycle
 * notifications. Payloads are participant-safe snapshots so retries cannot
 * expose later audit-only changes or describe a different lifecycle state.
 */
export const disciplinaryNotificationJobs = pgTable(
  "disciplinary_notification_jobs",
  {
    id: serial("id").primaryKey(),
    deduplicationKey: text("deduplication_key").notNull(),
    userId: integer("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    entityType: text("entity_type").notNull(),
    entityId: integer("entity_id").notNull(),
    notificationKind: text("notification_kind").notNull(),
    recipientEmail: text("recipient_email").notNull(),
    payload: jsonb("payload").notNull(),
    status: disciplinaryNotificationJobStatusEnum("status")
      .default("pending")
      .notNull(),
    lastError: text("last_error"),
    attempts: integer("attempts").default(0).notNull(),
    nextAttemptAt: timestamp("next_attempt_at").defaultNow().notNull(),
    leaseOwner: text("lease_owner"),
    leaseExpiresAt: timestamp("lease_expires_at"),
    completedAt: timestamp("completed_at"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("disciplinary_notification_jobs_deduplication_key_unique").on(
      table.deduplicationKey,
    ),
    index("disciplinary_notification_jobs_status_next_attempt_idx").on(
      table.status,
      table.nextAttemptAt,
    ),
    index("disciplinary_notification_jobs_entity_idx").on(
      table.entityType,
      table.entityId,
    ),
  ],
);

export const disciplinaryNotificationJobsRelations = relations(
  disciplinaryNotificationJobs,
  ({ one }) => ({
    user: one(users, {
      fields: [disciplinaryNotificationJobs.userId],
      references: [users.id],
    }),
  }),
);

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

export const featureFlagVisibilityEnum = pgEnum("feature_flag_visibility", [
  /** Nobody sees the feature, not even admins. */
  "hidden",
  /** Admins and festival admins see it in every environment; the public does not. */
  "admin_only",
  /** Everyone sees it. */
  "public",
]);

/**
 * Runtime visibility for features that ship before they launch.
 *
 * Rows are keyed by the code-owned registry in `app/lib/feature_flags/registry.ts`
 * and created on first read, so adding a flag never needs a data migration.
 * A key with no registry entry is ignored, which makes deleting a flag safe.
 *
 * Environment isolation comes from database topology, not from a column: local
 * development, the shared preview/staging database, and production each hold
 * their own rows.
 */
export const featureFlags = pgTable("feature_flags", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  visibility: featureFlagVisibilityEnum("visibility")
    .default("hidden")
    .notNull(),
  updatedByUserId: integer("updated_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const featureFlagsRelations = relations(
  featureFlags,
  ({ one, many }) => ({
    updatedBy: one(users, {
      fields: [featureFlags.updatedByUserId],
      references: [users.id],
    }),
    userTargets: many(featureFlagUserTargets),
  }),
);

/**
 * Per-user targeting: these users see the feature regardless of the flag's
 * visibility, including while it is `hidden`. Used for testers and closed betas.
 *
 * Allowlist only — there is no deny list, so a target can never take access away
 * from someone the visibility already grants it to.
 */
export const featureFlagUserTargets = pgTable(
  "feature_flag_user_targets",
  {
    id: serial("id").primaryKey(),
    flagId: integer("flag_id")
      .notNull()
      .references(() => featureFlags.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Why this person was added — "QA", "beta tester", a ticket reference. */
    note: text("note"),
    createdByUserId: integer("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    unique().on(t.flagId, t.userId),
    index("feature_flag_user_targets_user_id_idx").on(t.userId),
  ],
);
export const featureFlagUserTargetsRelations = relations(
  featureFlagUserTargets,
  ({ one }) => ({
    flag: one(featureFlags, {
      fields: [featureFlagUserTargets.flagId],
      references: [featureFlags.id],
    }),
    user: one(users, {
      fields: [featureFlagUserTargets.userId],
      references: [users.id],
    }),
    createdBy: one(users, {
      fields: [featureFlagUserTargets.createdByUserId],
      references: [users.id],
    }),
  }),
);

/* -------------------------------------------------------------------------- */
/* Paid programs and sessions                                                  */
/* See docs/ARCHITECTURE-paid-programs-and-sessions.md §6.                     */
/* Deliberately independent of festivalType, sectors, stands, reservations,    */
/* festival activities, store products, and the visitor `tickets` table. The   */
/* only link into an existing domain is the optional `programs.festivalId`.    */
/* -------------------------------------------------------------------------- */

/** Editorial publication state, for both programs and their sessions. */
export const programStatusEnum = pgEnum("program_status", [
  "draft",
  "published",
]);

export const sessionTypeEnum = pgEnum("session_type", ["talk", "workshop"]);

/** Aligned with `marketingBannerAudienceEnum` vocabulary. */
export const sessionAudienceEnum = pgEnum("session_audience", [
  "all",
  "participants_only",
  "public_only",
]);

export const sessionSkillLevelEnum = pgEnum("session_skill_level", [
  "beginner",
  "intermediate",
  "advanced",
]);

/**
 * Operational state of one scheduled occurrence. Sales state is derived from the
 * sales window rather than stored, and `rescheduled` is a flag (`rescheduledAt`)
 * rather than a status, so a rescheduled occurrence keeps selling.
 */
export const occurrenceLifecycleStatusEnum = pgEnum(
  "occurrence_lifecycle_status",
  ["scheduled", "completed", "cancelled"],
);

/**
 * How a participant discount is expressed. `percent` takes a share off the
 * public price; `fixed` takes a flat amount off it, clamped at zero.
 */
export const participantDiscountTypeEnum = pgEnum("participant_discount_type", [
  "percent",
  "fixed",
]);

/** A reusable place. Resolution is occurrence → session → program. */
export const venues = pgTable("venues", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  address: text("address"),
  locationLabel: text("location_label"),
  locationUrl: text("location_url"),
  isActive: boolean("is_active").default(true).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * Singleton defaults for the programs domain, following the `storeSettings`
 * precedent. The row is created on first read, so no seed migration is needed.
 */
export const programSettings = pgTable(
  "program_settings",
  {
    id: serial("id").primaryKey(),
    key: text("key").notNull().unique(),
    defaultParticipantDiscountType: participantDiscountTypeEnum(
      "default_participant_discount_type",
    )
      .default("percent")
      .notNull(),
    /** Percentage points when the type is `percent`, Bs when it is `fixed`. */
    defaultParticipantDiscountValue: numeric(
      "default_participant_discount_value",
      { precision: 10, scale: 2, mode: "number" },
    )
      .default(0)
      .notNull(),
    defaultHoldMinutes: integer("default_hold_minutes").default(20).notNull(),
    defaultOccurrenceCapacity: integer("default_occurrence_capacity")
      .default(20)
      .notNull(),
    defaultWaitlistInvitationWindowMinutes: integer(
      "default_waitlist_invitation_window_minutes",
    )
      .default(1440)
      .notNull(),
    attendeeCancellationCutoffHours: integer(
      "attendee_cancellation_cutoff_hours",
    )
      .default(48)
      .notNull(),
    bankQrImageUrl: text("bank_qr_image_url"),
    noRefundPolicyVersion: text("no_refund_policy_version")
      .default("v1")
      .notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    check(
      "program_settings_positive_durations",
      sql`${t.defaultHoldMinutes} > 0
        AND ${t.defaultOccurrenceCapacity} > 0
        AND ${t.defaultWaitlistInvitationWindowMinutes} > 0
        AND ${t.attendeeCancellationCutoffHours} > 0`,
    ),
    check(
      "program_settings_discount_range",
      sql`${t.defaultParticipantDiscountValue} >= 0
        AND (${t.defaultParticipantDiscountType} <> 'percent'
             OR ${t.defaultParticipantDiscountValue} <= 100)`,
    ),
  ],
);

/**
 * A thematic grouping of sessions. The festival link is optional: a program may
 * exist with no festival at all, and the link adds context, never dependency.
 */
export const programs = pgTable(
  "programs",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    summary: text("summary"),
    description: text("description"),
    bannerUrl: text("banner_url"),
    thumbnailUrl: text("thumbnail_url"),
    startDate: timestamp("start_date"),
    endDate: timestamp("end_date"),
    status: programStatusEnum("status").default("draft").notNull(),
    festivalId: integer("festival_id").references(() => festivals.id, {
      onDelete: "set null",
    }),
    defaultVenueId: integer("default_venue_id").references(() => venues.id, {
      onDelete: "restrict",
    }),
    /**
     * Overrides the global default. Both columns move together: null means
     * "inherit", and a set pair means "this program discounts like so".
     */
    participantDiscountType: participantDiscountTypeEnum(
      "participant_discount_type",
    ),
    participantDiscountValue: numeric("participant_discount_value", {
      precision: 10,
      scale: 2,
      mode: "number",
    }),
    waitlistInvitationWindowMinutes: integer(
      "waitlist_invitation_window_minutes",
    ),
    holdMinutes: integer("hold_minutes"),
    publishedAt: timestamp("published_at"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("programs_status_idx").on(t.status),
    index("programs_festival_id_idx").on(t.festivalId),
    check(
      "programs_date_range_valid",
      sql`${t.endDate} IS NULL OR ${t.startDate} IS NULL OR ${t.endDate} >= ${t.startDate}`,
    ),
    check(
      "programs_discount_pair_complete",
      sql`(${t.participantDiscountType} IS NULL AND ${t.participantDiscountValue} IS NULL)
        OR (${t.participantDiscountType} IS NOT NULL AND ${t.participantDiscountValue} IS NOT NULL)`,
    ),
    check(
      "programs_discount_range",
      sql`${t.participantDiscountValue} IS NULL
        OR (${t.participantDiscountValue} >= 0
            AND (${t.participantDiscountType} <> 'percent'
                 OR ${t.participantDiscountValue} <= 100))`,
    ),
    check(
      "programs_positive_overrides",
      sql`(${t.waitlistInvitationWindowMinutes} IS NULL OR ${t.waitlistInvitationWindowMinutes} > 0)
        AND (${t.holdMinutes} IS NULL OR ${t.holdMinutes} > 0)`,
    ),
  ],
);
export const programsRelations = relations(programs, ({ one, many }) => ({
  festival: one(festivals, {
    fields: [programs.festivalId],
    references: [festivals.id],
  }),
  defaultVenue: one(venues, {
    fields: [programs.defaultVenueId],
    references: [venues.id],
  }),
  sessions: many(programSessions),
}));

/**
 * Purchasable content: what the session is about, who gives it, what it costs.
 * Carries no schedule and no inventory — those belong to its occurrences.
 */
export const programSessions = pgTable(
  "program_sessions",
  {
    id: serial("id").primaryKey(),
    programId: integer("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    type: sessionTypeEnum("type").notNull(),
    topic: text("topic"),
    description: text("description"),
    /** Array of strings; the "what you'll take away" bullets. */
    learningOutcomes: jsonb("learning_outcomes").$type<string[]>().default([]),
    skillLevel: sessionSkillLevelEnum("skill_level"),
    imageUrl: text("image_url"),
    audience: sessionAudienceEnum("audience").default("all").notNull(),
    publicPrice: numeric("public_price", {
      precision: 10,
      scale: 2,
      mode: "number",
    })
      .default(0)
      .notNull(),
    /** Explicit override of the participant discount rule. */
    participantPrice: numeric("participant_price", {
      precision: 10,
      scale: 2,
      mode: "number",
    }),
    status: programStatusEnum("status").default("draft").notNull(),
    publishedAt: timestamp("published_at"),
    venueId: integer("venue_id").references(() => venues.id, {
      onDelete: "restrict",
    }),
    displayOrder: integer("display_order").default(0).notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    unique().on(t.programId, t.slug),
    index("program_sessions_program_id_status_idx").on(t.programId, t.status),
    check("program_sessions_public_price_positive", sql`${t.publicPrice} >= 0`),
    check(
      "program_sessions_participant_price_valid",
      sql`${t.participantPrice} IS NULL
        OR (${t.participantPrice} >= 0 AND ${t.participantPrice} <= ${t.publicPrice})`,
    ),
  ],
);
export const programSessionsRelations = relations(
  programSessions,
  ({ one, many }) => ({
    program: one(programs, {
      fields: [programSessions.programId],
      references: [programs.id],
    }),
    venue: one(venues, {
      fields: [programSessions.venueId],
      references: [venues.id],
    }),
    occurrences: many(sessionOccurrences),
    sessionSpeakers: many(sessionSpeakers),
  }),
);

/**
 * One scheduled instance of a session: its time, place, capacity, sales window,
 * and inventory. A repeat group created for demand is a separate occurrence and
 * shares no inventory with the original.
 */
export const sessionOccurrences = pgTable(
  "session_occurrences",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id")
      .notNull()
      .references(() => programSessions.id, { onDelete: "cascade" }),
    startsAt: timestamp("starts_at").notNull(),
    endsAt: timestamp("ends_at").notNull(),
    venueId: integer("venue_id").references(() => venues.id, {
      onDelete: "restrict",
    }),
    room: text("room"),
    capacity: integer("capacity").default(20).notNull(),
    salesStartAt: timestamp("sales_start_at"),
    salesEndAt: timestamp("sales_end_at"),
    /** Manual close, independent of the window. */
    salesClosedAt: timestamp("sales_closed_at"),
    lifecycleStatus: occurrenceLifecycleStatusEnum("lifecycle_status")
      .default("scheduled")
      .notNull(),
    cancelledAt: timestamp("cancelled_at"),
    cancelledReason: text("cancelled_reason"),
    completedAt: timestamp("completed_at"),
    /** Last reschedule; drives the badge and the refund-request right. */
    rescheduledAt: timestamp("rescheduled_at"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    // Target for the composite foreign key on `session_purchase_lines`, which
    // is what keeps a line's denormalized `sessionId` agreeing with the session
    // its occurrence actually belongs to.
    unique("session_occurrences_id_session_id_unique").on(t.id, t.sessionId),
    index("session_occurrences_session_id_starts_at_idx").on(
      t.sessionId,
      t.startsAt,
    ),
    index("session_occurrences_lifecycle_starts_at_idx").on(
      t.lifecycleStatus,
      t.startsAt,
    ),
    check(
      "session_occurrences_time_range_valid",
      sql`${t.endsAt} > ${t.startsAt}`,
    ),
    check("session_occurrences_capacity_positive", sql`${t.capacity} > 0`),
    check(
      "session_occurrences_sales_window_valid",
      sql`${t.salesEndAt} IS NULL OR ${t.salesStartAt} IS NULL OR ${t.salesEndAt} >= ${t.salesStartAt}`,
    ),
    check(
      "session_occurrences_cancelled_consistent",
      sql`${t.lifecycleStatus} <> 'cancelled' OR ${t.cancelledAt} IS NOT NULL`,
    ),
    check(
      "session_occurrences_completed_consistent",
      sql`${t.lifecycleStatus} <> 'completed' OR ${t.completedAt} IS NOT NULL`,
    ),
  ],
);
export const sessionOccurrencesRelations = relations(
  sessionOccurrences,
  ({ one, many }) => ({
    session: one(programSessions, {
      fields: [sessionOccurrences.sessionId],
      references: [programSessions.id],
    }),
    venue: one(venues, {
      fields: [sessionOccurrences.venueId],
      references: [venues.id],
    }),
    scheduleChanges: many(sessionOccurrenceScheduleChanges),
  }),
);

/**
 * A speaker or facilitator. Admin-maintained and account-free: a speaker never
 * needs a Glitter profile.
 */
export const speakers = pgTable("speakers", {
  id: serial("id").primaryKey(),
  publicName: text("public_name").notNull(),
  occupation: text("occupation"),
  imageUrl: text("image_url"),
  bio: text("bio"),
  /** Array of `{ label, url }`. */
  links: jsonb("links").$type<{ label: string; url: string }[]>().default([]),
  isActive: boolean("is_active").default(true).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const speakersRelations = relations(speakers, ({ many }) => ({
  sessionSpeakers: many(sessionSpeakers),
}));

/**
 * `ON DELETE RESTRICT` on the speaker keeps published history intact; retiring
 * a speaker uses `speakers.isActive` instead of deletion.
 */
export const sessionSpeakers = pgTable(
  "session_speakers",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id")
      .notNull()
      .references(() => programSessions.id, { onDelete: "cascade" }),
    speakerId: integer("speaker_id")
      .notNull()
      .references(() => speakers.id, { onDelete: "restrict" }),
    /** Display label, e.g. "Facilitadora". */
    role: text("role"),
    displayOrder: integer("display_order").default(0).notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [unique().on(t.sessionId, t.speakerId)],
);
export const sessionSpeakersRelations = relations(
  sessionSpeakers,
  ({ one }) => ({
    session: one(programSessions, {
      fields: [sessionSpeakers.sessionId],
      references: [programSessions.id],
    }),
    speaker: one(speakers, {
      fields: [sessionSpeakers.speakerId],
      references: [speakers.id],
    }),
  }),
);

/**
 * Immutable reschedule history. Insert-only: rescheduling updates the
 * occurrence in place and appends a row here, so tickets pointing at the
 * occurrence stay valid with no mutation.
 */
export const sessionOccurrenceScheduleChanges = pgTable(
  "session_occurrence_schedule_changes",
  {
    id: serial("id").primaryKey(),
    occurrenceId: integer("occurrence_id")
      .notNull()
      .references(() => sessionOccurrences.id, { onDelete: "cascade" }),
    fromStartsAt: timestamp("from_starts_at").notNull(),
    fromEndsAt: timestamp("from_ends_at").notNull(),
    toStartsAt: timestamp("to_starts_at").notNull(),
    toEndsAt: timestamp("to_ends_at").notNull(),
    fromVenueId: integer("from_venue_id").references(() => venues.id, {
      onDelete: "set null",
    }),
    toVenueId: integer("to_venue_id").references(() => venues.id, {
      onDelete: "set null",
    }),
    fromRoom: text("from_room"),
    toRoom: text("to_room"),
    reason: text("reason").notNull(),
    actorUserId: integer("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("session_occurrence_schedule_changes_occurrence_idx").on(
      t.occurrenceId,
      t.createdAt,
    ),
  ],
);
export const sessionOccurrenceScheduleChangesRelations = relations(
  sessionOccurrenceScheduleChanges,
  ({ one }) => ({
    occurrence: one(sessionOccurrences, {
      fields: [sessionOccurrenceScheduleChanges.occurrenceId],
      references: [sessionOccurrences.id],
    }),
    actor: one(users, {
      fields: [sessionOccurrenceScheduleChanges.actorUserId],
      references: [users.id],
    }),
  }),
);

/* --- Purchases, tickets, attendance (Phase 2 onward) ---------------------- */

export const sessionPurchaseStatusEnum = pgEnum("session_purchase_status", [
  "pending_upload",
  "under_verification",
  "changes_requested",
  "approved",
  "rejected",
  "expired",
  "cancelled",
]);

export const sessionPurchasePaymentModeEnum = pgEnum(
  "session_purchase_payment_mode",
  ["bank_qr", "free"],
);

/** Also used as the price basis on a line. */
export const participantEligibilityEnum = pgEnum("participant_eligibility", [
  "active_participant",
  "public",
]);

export const purchaseLineSourceEnum = pgEnum("purchase_line_source", [
  "individual_session",
  "pass_session",
]);

export const purchaseActorTypeEnum = pgEnum("purchase_actor_type", [
  "buyer",
  "admin",
  "system",
]);

export const sessionPurchaseEventTypeEnum = pgEnum(
  "session_purchase_event_type",
  [
    "created",
    "voucher_uploaded",
    "voucher_replaced",
    "changes_requested",
    "approved",
    "rejected",
    "cancelled_by_buyer",
    "cancelled_by_admin",
    "expired",
    "ticket_issued",
    "ticket_cancelled",
    "adjusted",
    "link_resent",
    "emails_resent",
    "refund_requested",
    "refund_resolved",
    "upgrade_initiated",
    "upgrade_completed",
  ],
);

export const sessionTicketStatusEnum = pgEnum("session_ticket_status", [
  "valid",
  "cancelled",
]);

export const attendanceMethodEnum = pgEnum("attendance_method", [
  "qr_scan",
  "manual_code",
]);

export const waitlistEntryStatusEnum = pgEnum("waitlist_entry_status", [
  "waiting",
  "invited",
  "converted",
  "removed",
]);

export const waitlistInvitationStatusEnum = pgEnum(
  "waitlist_invitation_status",
  ["sent", "converted", "expired", "revoked"],
);

/**
 * One checkout by one buyer: one total, one secure link, one or more lines.
 *
 * Pass, upgrade, and waitlist columns arrive with their own phases — they would
 * need foreign keys to tables that do not exist yet.
 */
export const sessionPurchases = pgTable(
  "session_purchases",
  {
    id: serial("id").primaryKey(),
    programId: integer("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "restrict" }),
    /**
     * `restrict`, not `set null`: a purchase is financial history, and nulling
     * the buyer would leave a row with no identity at all — which the identity
     * check below now correctly rejects. Deleting a buyer who has purchases has
     * to be handled deliberately rather than silently orphaning them.
     */
    userId: integer("user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    guestName: text("guest_name"),
    guestEmail: text("guest_email"),
    guestPhone: text("guest_phone"),
    /**
     * Demographics for attendees with no account, matching what visitor
     * registration collects. A signed-in buyer already has these on their
     * profile, so these stay null for them.
     *
     * Deliberately outside the identity check: they are analytics, not
     * identity, and keeping them out means anonymization can null them
     * outright instead of inventing a placeholder birthdate. Presence for
     * guests is enforced in the registration action.
     */
    guestGender: genderEnum("guest_gender"),
    guestBirthdate: date("guest_birthdate"),
    /**
     * SHA-256 of the access token, never the token itself. The raw value is
     * returned once, to the buyer, in their link and email; a database dump or
     * a leaked log therefore yields nothing usable. Lookups hash the presented
     * token and match on the digest.
     */
    accessTokenHash: text("access_token_hash").notNull().unique(),
    accessTokenRevokedAt: timestamp("access_token_revoked_at"),
    status: sessionPurchaseStatusEnum("status")
      .default("pending_upload")
      .notNull(),
    paymentMode: sessionPurchasePaymentModeEnum("payment_mode").notNull(),
    buyerEligibility: participantEligibilityEnum("buyer_eligibility").notNull(),
    eligibilityEvaluatedAt: timestamp("eligibility_evaluated_at").notNull(),
    eligibilitySnapshot: jsonb("eligibility_snapshot").notNull(),
    subtotalAmount: numeric("subtotal_amount", {
      precision: 10,
      scale: 2,
      mode: "number",
    }).notNull(),
    totalAmount: numeric("total_amount", {
      precision: 10,
      scale: 2,
      mode: "number",
    }).notNull(),
    holdExpiresAt: timestamp("hold_expires_at"),
    voucherSubmittedAt: timestamp("voucher_submitted_at"),
    approvedAt: timestamp("approved_at"),
    rejectedAt: timestamp("rejected_at"),
    expiredAt: timestamp("expired_at"),
    cancelledAt: timestamp("cancelled_at"),
    noRefundPolicyVersion: text("no_refund_policy_version").notNull(),
    noRefundPolicyAcceptedAt: timestamp(
      "no_refund_policy_accepted_at",
    ).notNull(),
    /** Client-supplied; a retried submit returns the existing purchase. */
    idempotencyKey: text("idempotency_key").notNull().unique(),

    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("session_purchases_status_hold_expires_idx").on(
      t.status,
      t.holdExpiresAt,
    ),
    index("session_purchases_user_created_idx").on(t.userId, t.createdAt),
    index("session_purchases_program_status_idx").on(t.programId, t.status),
    /**
     * Every conjunct is explicitly two-valued. Written with bare
     * `length(trim(col)) > 0`, a row with no identity at all evaluates to
     * `unknown` rather than false — and a CHECK accepts `unknown`, so the
     * constraint would have let identity-less purchases straight through.
     */
    check(
      "session_purchases_identity_check",
      sql`(
        (${t.userId} IS NOT NULL AND ${t.guestName} IS NULL AND ${t.guestEmail} IS NULL AND ${t.guestPhone} IS NULL)
        OR
        (${t.userId} IS NULL
         AND ${t.guestName} IS NOT NULL AND length(trim(${t.guestName})) > 0
         AND ${t.guestEmail} IS NOT NULL AND length(trim(${t.guestEmail})) > 0
         AND ${t.guestPhone} IS NOT NULL AND length(trim(${t.guestPhone})) > 0)
      )`,
    ),
    check(
      "session_purchases_amounts_valid",
      sql`${t.subtotalAmount} >= 0 AND ${t.totalAmount} >= 0 AND ${t.totalAmount} <= ${t.subtotalAmount}`,
    ),
    check(
      "session_purchases_free_has_no_hold",
      sql`${t.paymentMode} <> 'free' OR (${t.totalAmount} = 0 AND ${t.holdExpiresAt} IS NULL)`,
    ),
    check(
      "session_purchases_paid_has_hold",
      sql`${t.paymentMode} <> 'bank_qr' OR ${t.holdExpiresAt} IS NOT NULL`,
    ),
    check(
      "session_purchases_terminal_timestamps",
      sql`(${t.status} <> 'approved' OR ${t.approvedAt} IS NOT NULL)
        AND (${t.status} <> 'rejected' OR ${t.rejectedAt} IS NOT NULL)
        AND (${t.status} <> 'expired' OR ${t.expiredAt} IS NOT NULL)
        AND (${t.status} <> 'cancelled' OR ${t.cancelledAt} IS NOT NULL)`,
    ),
  ],
);
export const sessionPurchasesRelations = relations(
  sessionPurchases,
  ({ one, many }) => ({
    program: one(programs, {
      fields: [sessionPurchases.programId],
      references: [programs.id],
    }),
    buyer: one(users, {
      fields: [sessionPurchases.userId],
      references: [users.id],
    }),
    lines: many(sessionPurchaseLines),
    events: many(sessionPurchaseEvents),
    vouchers: many(sessionPurchaseVouchers),
  }),
);

/** One seat in one occurrence, with the price that applied to it. */
export const sessionPurchaseLines = pgTable(
  "session_purchase_lines",
  {
    id: serial("id").primaryKey(),
    purchaseId: integer("purchase_id")
      .notNull()
      .references(() => sessionPurchases.id, { onDelete: "cascade" }),
    // Both ids are constrained together by the composite key below, so neither
    // carries its own single-column reference.
    occurrenceId: integer("occurrence_id").notNull(),
    sessionId: integer("session_id").notNull(),
    source: purchaseLineSourceEnum("source")
      .default("individual_session")
      .notNull(),
    unitPrice: numeric("unit_price", {
      precision: 10,
      scale: 2,
      mode: "number",
    }).notNull(),
    priceBasis: participantEligibilityEnum("price_basis").notNull(),
    pricingSnapshot: jsonb("pricing_snapshot").notNull(),
    /** Survives later content edits and reschedules, for audit. */
    sessionTitleSnapshot: text("session_title_snapshot").notNull(),
    occurrenceStartsAtSnapshot: timestamp(
      "occurrence_starts_at_snapshot",
    ).notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    unique().on(t.purchaseId, t.occurrenceId),
    // Target for `session_tickets`' composite key.
    unique("session_purchase_lines_id_occurrence_id_unique").on(
      t.id,
      t.occurrenceId,
    ),
    /**
     * The occurrence must exist *and* belong to the denormalized session, so
     * the two ids can never drift apart. Mirrors
     * `order_items_product_variant_product_fk`.
     */
    /**
     * The occurrence must exist *and* belong to the denormalized session, so
     * the two ids can never drift apart. Mirrors
     * `order_items_product_variant_product_fk`.
     *
     * Added in a migration after the one creating this table: the unique key it
     * targets lands on the pre-existing `session_occurrences` as an ALTER, and
     * drizzle emits foreign keys before such ALTERs within a single migration.
     */
    foreignKey({
      name: "session_purchase_lines_occurrence_session_fk",
      columns: [t.occurrenceId, t.sessionId],
      foreignColumns: [sessionOccurrences.id, sessionOccurrences.sessionId],
    }).onDelete("restrict"),
    index("session_purchase_lines_occurrence_idx").on(t.occurrenceId),
    index("session_purchase_lines_purchase_idx").on(t.purchaseId),
    check("session_purchase_lines_price_positive", sql`${t.unitPrice} >= 0`),
    check(
      "session_purchase_lines_pass_line_free",
      sql`${t.source} <> 'pass_session' OR ${t.unitPrice} = 0`,
    ),
  ],
);
export const sessionPurchaseLinesRelations = relations(
  sessionPurchaseLines,
  ({ one }) => ({
    purchase: one(sessionPurchases, {
      fields: [sessionPurchaseLines.purchaseId],
      references: [sessionPurchases.id],
    }),
    occurrence: one(sessionOccurrences, {
      fields: [sessionPurchaseLines.occurrenceId],
      references: [sessionOccurrences.id],
    }),
    session: one(programSessions, {
      fields: [sessionPurchaseLines.sessionId],
      references: [programSessions.id],
    }),
    ticket: one(sessionTickets),
  }),
);

/**
 * Payment proofs for a bank-QR purchase. Append-only: a replacement is a new
 * row at the next version, never an update, so the file the team actually
 * reviewed stays recoverable after the buyer swaps it.
 *
 * The newest version is `max(version)`. Callers must lock the purchase row
 * before computing the next one — two concurrent uploads that both read
 * `max(version) = 2` would otherwise collide on the unique key, and the loser
 * would surface as a constraint error rather than a queued version.
 *
 * Superseded files are kept for audit. Removing one from storage goes through
 * the existing `storageCleanupJobs` outbox rather than an inline delete.
 */
export const sessionPurchaseVouchers = pgTable(
  "session_purchase_vouchers",
  {
    id: serial("id").primaryKey(),
    purchaseId: integer("purchase_id")
      .notNull()
      .references(() => sessionPurchases.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    fileUrl: text("file_url").notNull(),
    /** Null for a guest uploading through their secure link. */
    uploadedByUserId: integer("uploaded_by_user_id").references(
      () => users.id,
      { onDelete: "set null" },
    ),
    uploadedVia: purchaseActorTypeEnum("uploaded_via").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    // Also the lookup index for "newest version of this purchase" — Postgres
    // backs a unique constraint with a btree index, so a separate one on the
    // same columns would only cost writes.
    unique("session_purchase_vouchers_purchase_version_unique").on(
      t.purchaseId,
      t.version,
    ),
    check("session_purchase_vouchers_version_positive", sql`${t.version} >= 1`),
    check(
      "session_purchase_vouchers_file_present",
      sql`length(trim(${t.fileUrl})) > 0`,
    ),
    /**
     * A voucher is uploaded by the buyer or entered on their behalf by an
     * admin. `system` never uploads one, and allowing it would let an
     * unattributable proof into the audit trail.
     */
    check(
      "session_purchase_vouchers_uploaded_via_valid",
      sql`${t.uploadedVia} IN ('buyer', 'admin')`,
    ),
  ],
);

export const sessionPurchaseVouchersRelations = relations(
  sessionPurchaseVouchers,
  ({ one }) => ({
    purchase: one(sessionPurchases, {
      fields: [sessionPurchaseVouchers.purchaseId],
      references: [sessionPurchases.id],
    }),
    uploadedBy: one(users, {
      fields: [sessionPurchaseVouchers.uploadedByUserId],
      references: [users.id],
    }),
  }),
);

/**
 * Audit trail, insert-only, mirroring `sanctionEvents`. The reason check is how
 * "every sensitive admin action requires a reason" becomes an invariant rather
 * than a convention.
 */
export const sessionPurchaseEvents = pgTable(
  "session_purchase_events",
  {
    id: serial("id").primaryKey(),
    purchaseId: integer("purchase_id")
      .notNull()
      .references(() => sessionPurchases.id, { onDelete: "cascade" }),
    actorType: purchaseActorTypeEnum("actor_type").notNull(),
    actorUserId: integer("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    eventType: sessionPurchaseEventTypeEnum("event_type").notNull(),
    fromStatus: sessionPurchaseStatusEnum("from_status"),
    toStatus: sessionPurchaseStatusEnum("to_status"),
    reason: text("reason"),
    changes: jsonb("changes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("session_purchase_events_purchase_created_idx").on(
      t.purchaseId,
      t.createdAt,
    ),
    check(
      "session_purchase_events_admin_needs_reason",
      sql`${t.actorType} <> 'admin' OR (${t.reason} IS NOT NULL AND length(trim(${t.reason})) > 0)`,
    ),
  ],
);
export const sessionPurchaseEventsRelations = relations(
  sessionPurchaseEvents,
  ({ one }) => ({
    purchase: one(sessionPurchases, {
      fields: [sessionPurchaseEvents.purchaseId],
      references: [sessionPurchases.id],
    }),
    actor: one(users, {
      fields: [sessionPurchaseEvents.actorUserId],
      references: [users.id],
    }),
  }),
);

/**
 * Valid for one person and one occurrence. The unique `purchaseLineId` is what
 * makes issuance idempotent: approving twice inserts nothing the second time.
 */
export const sessionTickets = pgTable(
  "session_tickets",
  {
    id: serial("id").primaryKey(),
    purchaseLineId: integer("purchase_line_id").notNull().unique(),
    // Constrained together with `purchaseLineId` below, so a ticket can never
    // name a different occurrence than the line it was issued from.
    occurrenceId: integer("occurrence_id").notNull(),
    /** Opaque QR payload. */
    code: text("code").notNull().unique(),
    status: sessionTicketStatusEnum("status").default("valid").notNull(),
    attendeeUserId: integer("attendee_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /** Snapshot so check-in lists work for guests and survive profile edits. */
    attendeeName: text("attendee_name").notNull(),
    attendeeEmail: text("attendee_email").notNull(),
    issuedAt: timestamp("issued_at").defaultNow().notNull(),
    cancelledAt: timestamp("cancelled_at"),
    cancelledReason: text("cancelled_reason"),
    cancelledByActorType: purchaseActorTypeEnum("cancelled_by_actor_type"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    // Target for `session_attendances`' composite key.
    unique("session_tickets_id_occurrence_id_unique").on(t.id, t.occurrenceId),
    foreignKey({
      name: "session_tickets_line_occurrence_fk",
      columns: [t.purchaseLineId, t.occurrenceId],
      foreignColumns: [
        sessionPurchaseLines.id,
        sessionPurchaseLines.occurrenceId,
      ],
    }).onDelete("cascade"),
    // "One person, one seat per occurrence" across every purchase, not just
    // within one. Partial so a cancelled ticket frees the slot for a re-buy.
    uniqueIndex("session_tickets_occurrence_attendee_user_idx")
      .on(t.occurrenceId, t.attendeeUserId)
      .where(sql`${t.status} = 'valid' AND ${t.attendeeUserId} IS NOT NULL`),
    uniqueIndex("session_tickets_occurrence_attendee_email_idx")
      .on(t.occurrenceId, sql`lower(${t.attendeeEmail})`)
      .where(sql`${t.status} = 'valid'`),
    index("session_tickets_occurrence_status_idx").on(t.occurrenceId, t.status),
    check(
      "session_tickets_cancelled_consistent",
      sql`${t.status} <> 'cancelled' OR ${t.cancelledAt} IS NOT NULL`,
    ),
  ],
);
export const sessionTicketsRelations = relations(sessionTickets, ({ one }) => ({
  purchaseLine: one(sessionPurchaseLines, {
    fields: [sessionTickets.purchaseLineId],
    references: [sessionPurchaseLines.id],
  }),
  occurrence: one(sessionOccurrences, {
    fields: [sessionTickets.occurrenceId],
    references: [sessionOccurrences.id],
  }),
  attendee: one(users, {
    fields: [sessionTickets.attendeeUserId],
    references: [users.id],
  }),
  attendance: one(sessionAttendances),
}));

/**
 * The check-in record. One per ticket — that unique constraint *is* the
 * duplicate-scan rule. Kept separate from ticket validity so a cancelled ticket
 * that was already scanned keeps its history.
 */
export const sessionAttendances = pgTable(
  "session_attendances",
  {
    id: serial("id").primaryKey(),
    ticketId: integer("ticket_id").notNull().unique(),
    // Constrained together with `ticketId` below: an attendance always records
    // the occurrence its ticket was actually issued for.
    occurrenceId: integer("occurrence_id").notNull(),
    checkedInAt: timestamp("checked_in_at").defaultNow().notNull(),
    operatorUserId: integer("operator_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    method: attendanceMethodEnum("method").default("qr_scan").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    foreignKey({
      name: "session_attendances_ticket_occurrence_fk",
      columns: [t.ticketId, t.occurrenceId],
      foreignColumns: [sessionTickets.id, sessionTickets.occurrenceId],
    }).onDelete("cascade"),
    index("session_attendances_occurrence_idx").on(t.occurrenceId),
  ],
);
export const sessionAttendancesRelations = relations(
  sessionAttendances,
  ({ one }) => ({
    ticket: one(sessionTickets, {
      fields: [sessionAttendances.ticketId],
      references: [sessionTickets.id],
    }),
    occurrence: one(sessionOccurrences, {
      fields: [sessionAttendances.occurrenceId],
      references: [sessionOccurrences.id],
    }),
  }),
);

/**
 * Interest in a sold-out occurrence.
 *
 * Deliberately has no `position` column. The PRD forbids promising an
 * arrival-order queue, so ordering is a presentation choice over `createdAt`
 * and an admin may invite anyone on the list. Storing a position would turn a
 * courtesy list into a promise the team cannot keep.
 */
export const sessionWaitlistEntries = pgTable(
  "session_waitlist_entries",
  {
    id: serial("id").primaryKey(),
    occurrenceId: integer("occurrence_id")
      .notNull()
      .references(() => sessionOccurrences.id, { onDelete: "cascade" }),
    userId: integer("user_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    guestName: text("guest_name"),
    guestEmail: text("guest_email"),
    guestPhone: text("guest_phone"),
    status: waitlistEntryStatusEnum("status").default("waiting").notNull(),
    /** Admin context — why this person is here, or what was agreed. */
    notes: text("notes"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    /**
     * Same two-valued shape as `session_purchases_identity_check`: written with
     * bare `length(trim(col)) > 0` an identity-less row evaluates to `unknown`,
     * and a CHECK accepts `unknown`.
     */
    check(
      "session_waitlist_entries_identity_check",
      sql`(
        (${t.userId} IS NOT NULL AND ${t.guestName} IS NULL AND ${t.guestEmail} IS NULL AND ${t.guestPhone} IS NULL)
        OR
        (${t.userId} IS NULL
         AND ${t.guestName} IS NOT NULL AND length(trim(${t.guestName})) > 0
         AND ${t.guestEmail} IS NOT NULL AND length(trim(${t.guestEmail})) > 0
         AND ${t.guestPhone} IS NOT NULL AND length(trim(${t.guestPhone})) > 0)
      )`,
    ),
    // Partial so a removed entry frees the slot for a re-join.
    uniqueIndex("session_waitlist_entries_occurrence_user_idx")
      .on(t.occurrenceId, t.userId)
      .where(sql`${t.status} <> 'removed' AND ${t.userId} IS NOT NULL`),
    uniqueIndex("session_waitlist_entries_occurrence_email_idx")
      .on(t.occurrenceId, sql`lower(${t.guestEmail})`)
      .where(sql`${t.status} <> 'removed' AND ${t.guestEmail} IS NOT NULL`),
    index("session_waitlist_entries_occurrence_status_idx").on(
      t.occurrenceId,
      t.status,
    ),
  ],
);

export const sessionWaitlistEntriesRelations = relations(
  sessionWaitlistEntries,
  ({ one, many }) => ({
    occurrence: one(sessionOccurrences, {
      fields: [sessionWaitlistEntries.occurrenceId],
      references: [sessionOccurrences.id],
    }),
    user: one(users, {
      fields: [sessionWaitlistEntries.userId],
      references: [users.id],
    }),
    invitations: many(sessionWaitlistInvitations),
  }),
);

/**
 * A time-boxed, audited invitation to buy a seat that was released.
 *
 * Never issued automatically: PRD §8.2 and roadmap Phase 5 both require an
 * admin to choose the person, which is why `reason` is `NOT NULL`. The
 * partial unique index below is what makes "one live invitation per entry" an
 * invariant rather than a convention.
 */
export const sessionWaitlistInvitations = pgTable(
  "session_waitlist_invitations",
  {
    id: serial("id").primaryKey(),
    waitlistEntryId: integer("waitlist_entry_id")
      .notNull()
      .references(() => sessionWaitlistEntries.id, { onDelete: "cascade" }),
    /** SHA-256 digest, never the raw token — same rule as purchase access. */
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at").notNull(),
    status: waitlistInvitationStatusEnum("status").default("sent").notNull(),
    invitedByUserId: integer("invited_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    reason: text("reason").notNull(),
    purchaseId: integer("purchase_id").references(() => sessionPurchases.id, {
      onDelete: "set null",
    }),
    convertedAt: timestamp("converted_at"),
    revokedAt: timestamp("revoked_at"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    // One live invitation per entry; expired and revoked ones accumulate as
    // history without blocking a fresh invite.
    uniqueIndex("session_waitlist_invitations_live_idx")
      .on(t.waitlistEntryId)
      .where(sql`${t.status} = 'sent'`),
    index("session_waitlist_invitations_status_expires_idx").on(
      t.status,
      t.expiresAt,
    ),
    check(
      "session_waitlist_invitations_reason_present",
      sql`length(trim(${t.reason})) > 0`,
    ),
    /**
     * Timestamps only. An earlier version also required `purchaseId` on a
     * converted row, which is unsatisfiable alongside the `ON DELETE SET NULL`
     * on that column: deleting the purchase fires an UPDATE the CHECK then
     * rejects, making the purchase undeletable. `convertedAt` is the durable
     * record that the invitation was used; the purchase link is a convenience
     * that may legitimately go null once the purchase is gone.
     */
    check(
      "session_waitlist_invitations_terminal_timestamps",
      sql`(${t.status} <> 'converted' OR ${t.convertedAt} IS NOT NULL)
        AND (${t.status} <> 'revoked' OR ${t.revokedAt} IS NOT NULL)`,
    ),
  ],
);

export const sessionWaitlistInvitationsRelations = relations(
  sessionWaitlistInvitations,
  ({ one }) => ({
    entry: one(sessionWaitlistEntries, {
      fields: [sessionWaitlistInvitations.waitlistEntryId],
      references: [sessionWaitlistEntries.id],
    }),
    purchase: one(sessionPurchases, {
      fields: [sessionWaitlistInvitations.purchaseId],
      references: [sessionPurchases.id],
    }),
  }),
);
