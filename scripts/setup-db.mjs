import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.POSTGRES_URL,
});

async function main() {
  if (!process.env.POSTGRES_URL) {
    console.info("POSTGRES_URL is not set. Skipping setup.");
    process.exit(0);
  }

  const client = await pool.connect();

  try {
    // Create enums
    const enums = [
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN CREATE TYPE user_role AS ENUM ('admin', 'artist', 'user', 'festival_admin'); END IF; END $$`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_category') THEN CREATE TYPE user_category AS ENUM ('none', 'illustration', 'gastronomy', 'entrepreneurship', 'new_artist'); END IF; END $$`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_status') THEN CREATE TYPE user_status AS ENUM ('verified', 'pending', 'rejected', 'banned'); END IF; END $$`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'gender') THEN CREATE TYPE gender AS ENUM ('male', 'female', 'non_binary', 'other', 'undisclosed'); END IF; END $$`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'festival_status') THEN CREATE TYPE festival_status AS ENUM ('draft', 'published', 'active', 'archived'); END IF; END $$`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'festival_map_version') THEN CREATE TYPE festival_map_version AS ENUM ('v1', 'v2', 'v3'); END IF; END $$`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'festival_type') THEN CREATE TYPE festival_type AS ENUM ('glitter', 'twinkler', 'festicker'); END IF; END $$`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'participation_request_status') THEN CREATE TYPE participation_request_status AS ENUM ('pending', 'accepted', 'rejected'); END IF; END $$`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reservation_status') THEN CREATE TYPE reservation_status AS ENUM ('pending', 'verification_payment', 'accepted', 'rejected'); END IF; END $$`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_request_type') THEN CREATE TYPE user_request_type AS ENUM ('festival_participation', 'become_artist'); END IF; END $$`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_social_type') THEN CREATE TYPE user_social_type AS ENUM ('instagram', 'facebook', 'tiktok', 'twitter', 'youtube'); END IF; END $$`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'stand_status') THEN CREATE TYPE stand_status AS ENUM ('available', 'reserved', 'confirmed', 'disabled'); END IF; END $$`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'stand_orientation') THEN CREATE TYPE stand_orientation AS ENUM ('portrait', 'landscape'); END IF; END $$`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'stand_zone') THEN CREATE TYPE stand_zone AS ENUM ('main', 'secondary'); END IF; END $$`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'event_discovery') THEN CREATE TYPE event_discovery AS ENUM ('facebook', 'instagram', 'tiktok', 'cba', 'friends', 'participant_invitation', 'casual', 'la_rota', 'other'); END IF; END $$`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ticket_status') THEN CREATE TYPE ticket_status AS ENUM ('pending', 'checked_in'); END IF; END $$`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'scheduled_task_type') THEN CREATE TYPE scheduled_task_type AS ENUM ('profile_creation', 'stand_reservation'); END IF; END $$`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invoice_status') THEN CREATE TYPE invoice_status AS ENUM ('pending', 'paid', 'cancelled'); END IF; END $$`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'festival_activity_type') THEN CREATE TYPE festival_activity_type AS ENUM ('stamp_passport', 'sticker_print', 'best_stand', 'festival_sticker'); END IF; END $$`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'access_level') THEN CREATE TYPE access_level AS ENUM ('public', 'festival_participants_only'); END IF; END $$`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'festival_activity_status') THEN CREATE TYPE festival_activity_status AS ENUM ('draft', 'published', 'active', 'archived'); END IF; END $$`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'map_template_status') THEN CREATE TYPE map_template_status AS ENUM ('draft', 'active', 'archived'); END IF; END $$`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'map_template_stand_type') THEN CREATE TYPE map_template_stand_type AS ENUM ('default', 'double'); END IF; END $$`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'collaborator_role') THEN CREATE TYPE collaborator_role AS ENUM ('sector_coordinator', 'general_collaborator', 'logistics', 'security'); END IF; END $$`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'infraction_severity') THEN CREATE TYPE infraction_severity AS ENUM ('mild', 'medium', 'severe'); END IF; END $$`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'infraction_status') THEN CREATE TYPE infraction_status AS ENUM ('active', 'resolved', 'cancelled'); END IF; END $$`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_status') THEN CREATE TYPE order_status AS ENUM ('pending', 'completed', 'cancelled'); END IF; END $$`,
    ];

    for (const sql of enums) {
      await client.query(sql);
    }
    console.info("Enums created.");

    // Create tables
    const tables = [
      `CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        bio TEXT,
        birthdate TIMESTAMP,
        clerk_id TEXT UNIQUE NOT NULL,
        display_name TEXT,
        first_name TEXT,
        email TEXT UNIQUE NOT NULL,
        image_url TEXT,
        last_name TEXT,
        phone_number TEXT,
        role user_role NOT NULL DEFAULT 'user',
        category user_category NOT NULL DEFAULT 'none',
        status user_status NOT NULL DEFAULT 'pending',
        gender gender NOT NULL DEFAULT 'undisclosed',
        state TEXT,
        country TEXT NOT NULL DEFAULT 'BO',
        verified_at TIMESTAMP,
        should_submit_products BOOLEAN NOT NULL DEFAULT false,
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS display_name_idx ON users (display_name)`,

      `CREATE TABLE IF NOT EXISTS tags (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        category user_category NOT NULL DEFAULT 'none',
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`,

      `CREATE TABLE IF NOT EXISTS profile_tags (
        id SERIAL PRIMARY KEY,
        profile_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`,

      `CREATE TABLE IF NOT EXISTS subcategories (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        category user_category NOT NULL DEFAULT 'none',
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`,

      `CREATE TABLE IF NOT EXISTS profile_subcategories (
        id SERIAL PRIMARY KEY,
        profile_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        subcategory_id INTEGER NOT NULL REFERENCES subcategories(id) ON DELETE CASCADE,
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`,

      `CREATE TABLE IF NOT EXISTS festivals (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        description TEXT,
        address TEXT,
        location_label TEXT,
        location_url TEXT,
        start_date TIMESTAMP,
        status festival_status NOT NULL DEFAULT 'draft',
        end_date TIMESTAMP,
        maps_version festival_map_version NOT NULL DEFAULT 'v1',
        public_registration BOOLEAN NOT NULL DEFAULT false,
        event_day_registration BOOLEAN NOT NULL DEFAULT false,
        reservations_start_date TIMESTAMP NOT NULL DEFAULT NOW(),
        general_map_url TEXT,
        mascot_url TEXT,
        festival_type festival_type NOT NULL DEFAULT 'glitter',
        illustration_payment_qr_code_url TEXT,
        gastronomy_payment_qr_code_url TEXT,
        entrepreneurship_payment_qr_code_url TEXT,
        illustration_stand_url TEXT,
        gastronomy_stand_url TEXT,
        entrepreneurship_stand_url TEXT,
        festival_code TEXT,
        festival_banner_url TEXT,
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS name_idx ON festivals (name)`,

      `CREATE TABLE IF NOT EXISTS festival_sectors (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        map_url TEXT,
        festival_id INTEGER NOT NULL REFERENCES festivals(id) ON DELETE CASCADE,
        order_in_festival SMALLINT NOT NULL DEFAULT 1,
        mascot_url TEXT,
        map_origin_x REAL,
        map_origin_y REAL,
        map_width REAL,
        map_height REAL,
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS festival_sector_name_idx ON festival_sectors (name)`,

      `CREATE TABLE IF NOT EXISTS festival_dates (
        id SERIAL PRIMARY KEY,
        festival_id INTEGER NOT NULL REFERENCES festivals(id) ON DELETE CASCADE,
        start_date TIMESTAMP NOT NULL,
        end_date TIMESTAMP NOT NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS festival_dates_festival_id_idx ON festival_dates (festival_id)`,

      `CREATE TABLE IF NOT EXISTS user_requests (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        festival_id INTEGER REFERENCES festivals(id),
        type user_request_type NOT NULL DEFAULT 'become_artist',
        status participation_request_status NOT NULL DEFAULT 'pending',
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`,

      `CREATE TABLE IF NOT EXISTS user_socials (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type user_social_type NOT NULL,
        username TEXT NOT NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`,

      `CREATE TABLE IF NOT EXISTS qr_codes (
        id SERIAL PRIMARY KEY,
        qr_code_url TEXT NOT NULL,
        amount REAL NOT NULL,
        expiration_date TIMESTAMP NOT NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`,

      `CREATE TABLE IF NOT EXISTS stands (
        id SERIAL PRIMARY KEY,
        label TEXT,
        status stand_status NOT NULL DEFAULT 'available',
        orientation stand_orientation NOT NULL DEFAULT 'landscape',
        stand_number INTEGER NOT NULL,
        stand_category user_category NOT NULL DEFAULT 'illustration',
        zone stand_zone NOT NULL DEFAULT 'main',
        width REAL,
        height REAL,
        position_left REAL,
        position_top REAL,
        price REAL NOT NULL DEFAULT 0,
        festival_id INTEGER,
        festival_sector_id INTEGER REFERENCES festival_sectors(id),
        qr_code_id INTEGER REFERENCES qr_codes(id),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS stand_label_idx ON stands (label)`,

      `CREATE TABLE IF NOT EXISTS stand_reservations (
        id SERIAL PRIMARY KEY,
        stand_id INTEGER NOT NULL,
        festival_id INTEGER NOT NULL,
        status reservation_status NOT NULL DEFAULT 'pending',
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`,

      `CREATE TABLE IF NOT EXISTS participations (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        reservation_id INTEGER NOT NULL REFERENCES stand_reservations(id) ON DELETE CASCADE,
        has_stamp BOOLEAN NOT NULL DEFAULT false,
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`,

      `CREATE TABLE IF NOT EXISTS visitors (
        id SERIAL PRIMARY KEY,
        first_name TEXT,
        last_name TEXT,
        email TEXT UNIQUE NOT NULL,
        phone_number TEXT NOT NULL,
        event_discovery event_discovery NOT NULL DEFAULT 'other',
        gender gender NOT NULL DEFAULT 'undisclosed',
        birthdate TIMESTAMP NOT NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`,

      `CREATE TABLE IF NOT EXISTS tickets (
        id SERIAL PRIMARY KEY,
        date TIMESTAMP NOT NULL,
        status ticket_status NOT NULL DEFAULT 'pending',
        qr_code TEXT,
        qr_code_url TEXT,
        visitor_id INTEGER NOT NULL,
        is_event_day_creation BOOLEAN NOT NULL DEFAULT false,
        festival_id INTEGER NOT NULL,
        number_of_visitors INTEGER NOT NULL DEFAULT 1,
        ticket_number INTEGER,
        checked_in_at TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`,

      `CREATE TABLE IF NOT EXISTS scheduled_tasks (
        id SERIAL PRIMARY KEY,
        task_type scheduled_task_type NOT NULL DEFAULT 'profile_creation',
        due_date TIMESTAMP NOT NULL,
        completed_at TIMESTAMP,
        reminder_time TIMESTAMP NOT NULL,
        reminder_sent_at TIMESTAMP,
        profile_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        reservation_id INTEGER REFERENCES stand_reservations(id) ON DELETE CASCADE,
        ran_after_due_date BOOLEAN NOT NULL DEFAULT false,
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`,

      `CREATE TABLE IF NOT EXISTS invoices (
        id SERIAL PRIMARY KEY,
        amount REAL NOT NULL,
        date TIMESTAMP NOT NULL,
        status invoice_status NOT NULL DEFAULT 'pending',
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        reservation_id INTEGER NOT NULL REFERENCES stand_reservations(id) ON DELETE CASCADE,
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`,

      `CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        amount REAL NOT NULL,
        date TIMESTAMP NOT NULL,
        invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
        voucher_url TEXT NOT NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`,

      `CREATE TABLE IF NOT EXISTS festival_activities (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        registration_start_date TIMESTAMP NOT NULL,
        registration_end_date TIMESTAMP NOT NULL,
        promotional_art_url TEXT,
        festival_id INTEGER NOT NULL REFERENCES festivals(id) ON DELETE CASCADE,
        visitors_description TEXT,
        type festival_activity_type NOT NULL DEFAULT 'stamp_passport',
        activity_prize_url TEXT,
        allows_voting BOOLEAN NOT NULL DEFAULT false,
        access_level access_level NOT NULL DEFAULT 'public',
        status festival_activity_status NOT NULL DEFAULT 'draft',
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`,

      `CREATE TABLE IF NOT EXISTS festival_activity_votes (
        id SERIAL PRIMARY KEY,
        festival_activity_id INTEGER NOT NULL REFERENCES festival_activities(id) ON DELETE CASCADE,
        stand_id INTEGER NOT NULL REFERENCES stands(id) ON DELETE CASCADE,
        visitor_id INTEGER REFERENCES visitors(id),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`,

      `CREATE TABLE IF NOT EXISTS badges (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        image_url TEXT NOT NULL,
        festival_id INTEGER REFERENCES festivals(id) ON DELETE CASCADE,
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`,

      `CREATE TABLE IF NOT EXISTS user_badges (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        badge_id INTEGER NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`,

      `CREATE TABLE IF NOT EXISTS map_templates (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        map_url TEXT,
        status map_template_status NOT NULL DEFAULT 'draft',
        origin_x REAL,
        origin_y REAL,
        width REAL,
        height REAL,
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`,

      `CREATE TABLE IF NOT EXISTS map_template_stands (
        id SERIAL PRIMARY KEY,
        map_template_id INTEGER NOT NULL REFERENCES map_templates(id) ON DELETE CASCADE,
        label TEXT,
        stand_number INTEGER NOT NULL,
        stand_category user_category NOT NULL DEFAULT 'illustration',
        zone stand_zone NOT NULL DEFAULT 'main',
        orientation stand_orientation NOT NULL DEFAULT 'landscape',
        type map_template_stand_type NOT NULL DEFAULT 'default',
        width REAL,
        height REAL,
        position_left REAL,
        position_top REAL,
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`,

      `CREATE TABLE IF NOT EXISTS reservation_collaborators (
        id SERIAL PRIMARY KEY,
        reservation_id INTEGER NOT NULL REFERENCES stand_reservations(id) ON DELETE CASCADE,
        collaborator_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role collaborator_role NOT NULL DEFAULT 'general_collaborator',
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`,

      `CREATE TABLE IF NOT EXISTS collaborators_attendance_logs (
        id SERIAL PRIMARY KEY,
        collaborator_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        festival_date_id INTEGER NOT NULL REFERENCES festival_dates(id) ON DELETE CASCADE,
        check_in TIMESTAMP NOT NULL DEFAULT NOW(),
        check_out TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`,

      `CREATE TABLE IF NOT EXISTS infractions (
        id SERIAL PRIMARY KEY,
        description TEXT,
        severity infraction_severity NOT NULL DEFAULT 'mild',
        status infraction_status NOT NULL DEFAULT 'active',
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        festival_id INTEGER NOT NULL REFERENCES festivals(id) ON DELETE CASCADE,
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`,

      `CREATE TABLE IF NOT EXISTS participant_products (
        id SERIAL PRIMARY KEY,
        image_url TEXT NOT NULL,
        description TEXT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        reservation_id INTEGER NOT NULL REFERENCES stand_reservations(id) ON DELETE CASCADE,
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`,

      `CREATE TABLE IF NOT EXISTS store_items (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        image_url TEXT NOT NULL,
        price REAL NOT NULL DEFAULT 0,
        stock INTEGER NOT NULL DEFAULT 0,
        festival_id INTEGER NOT NULL REFERENCES festivals(id) ON DELETE CASCADE,
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`,

      `CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        total REAL NOT NULL DEFAULT 0,
        status order_status NOT NULL DEFAULT 'pending',
        festival_id INTEGER NOT NULL REFERENCES festivals(id) ON DELETE CASCADE,
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`,

      `CREATE TABLE IF NOT EXISTS order_items (
        id SERIAL PRIMARY KEY,
        quantity INTEGER NOT NULL DEFAULT 1,
        unit_price REAL NOT NULL DEFAULT 0,
        order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        store_item_id INTEGER NOT NULL REFERENCES store_items(id) ON DELETE CASCADE,
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`,
    ];

    for (const sql of tables) {
      await client.query(sql);
    }

    console.info("Database setup completed successfully.");
  } catch (error) {
    console.error("Database setup error:", error.message || error);
    // Don't throw - let the app start even if DB setup fails
  } finally {
    client.release();
    await pool.end();
  }
}

main();
