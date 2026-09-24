import { assertAppDatabaseIsTestDatabase } from "./scripts/lib/integration-database-guard";

// A setup file runs before the test file's own imports, so this fires before
// any suite can load `@/db` and bind its pool to the wrong database.
assertAppDatabaseIsTestDatabase();
