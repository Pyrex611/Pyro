import "server-only";
import pg from "pg";
const { Pool } = pg;
import { config } from "./config";

declare global {
  var _neonPool: pg.Pool | undefined;
}

export function getDbPool(): pg.Pool {
  if (!config.databaseUrl) {
    throw new Error("DATABASE_URL is missing. Please set it in your environment or .env.local.");
  }

  if (!global._neonPool) {
    global._neonPool = new Pool({
      connectionString: config.databaseUrl,
      ssl: { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
    });
  }
  return global._neonPool;
}