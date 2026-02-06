import { migrate } from "drizzle-orm/node-postgres/migrator";
import { pool, db } from "@/db";

async function main() {
	if (!process.env.POSTGRES_URL) {
		console.info("POSTGRES_URL is not set. Skipping migration.");
		await pool.end();
		return;
	}

	try {
		const client = await pool.connect();
		try {
			await migrate(db, { migrationsFolder: "./drizzle" });
			console.info("Migration completed successfully.");
		} finally {
			client.release();
		}
	} catch (error: unknown) {
		const pgError = error as { code?: string };
		if (pgError.code === "ECONNREFUSED") {
			console.warn(
				"Could not connect to the database. Skipping migration. " +
					"Make sure your database is running and POSTGRES_URL is correct.",
			);
		} else {
			throw error;
		}
	} finally {
		await pool.end();
	}
}

main();
