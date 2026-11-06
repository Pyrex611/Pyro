export const CSV_HEADER = [
  "name",
  "phone",
  "email",
  "website",
  "address",
  "city",
  "state",
  "zip",
  "niche",
  "score",
  "decision_maker",
] as const;

function escapeCsv(val: unknown): string {
  if (val === undefined || val === null) return "";
  const str = typeof val === "object" ? JSON.stringify(val) : String(val);
  return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

export function toCsvString(records: Record<string, any>[]): string {
  const headerLine = CSV_HEADER.join(",");
  const rows = records.map((r) =>
    [
      r.name,
      r.phone_e164 ?? r.phone,
      r.email,
      r.website,
      r.address,
      r.city,
      r.state,
      r.zip,
      r.niche,
      r.score,
      r.decision_maker?.name ?? "",
    ]
      .map(escapeCsv)
      .join(",")
  );
  return [headerLine, ...rows].join("\n") + "\n";
}