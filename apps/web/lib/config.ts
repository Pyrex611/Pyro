export const config = {
  databaseUrl: (process.env.DATABASE_URL ?? "").trim(),
  apifyToken: (process.env.APIFY_TOKEN ?? "").trim(),
  moltsetsApiKey: (process.env.MOLTSETS_API_KEY ?? "").trim(),
  gmapsServiceUrl: (
    process.env.GMAPS_SERVICE_URL || "https://gmaps-scraper-87643659933.us-central1.run.app"
  ).trim(),
  gmapsServiceToken: (process.env.GMAPS_SERVICE_TOKEN ?? "").trim(),
  webhookSecret: (
    process.env.PYRO_WEBHOOK_SECRET || "7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069"
  ).trim(),
};

export const isNeonConfigured = () => config.databaseUrl.length > 0;
export const isApifyConfigured = () => config.apifyToken.length > 0;
export const isMoltsetsConfigured = () => config.moltsetsApiKey.length > 0;
export const isGmapsConfigured = () => config.gmapsServiceUrl.length > 0;