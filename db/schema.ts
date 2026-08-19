import { boolean, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const role = pgEnum("Role", [
  "FRONTLINE",
  "SAFETY_OFFICER",
  "SAFETY_MANAGER",
  "INVESTIGATOR",
  "KEY_MANAGEMENT",
  "ACCOUNTABLE_EXECUTIVE",
  "REGULATOR_INSPECTOR",
  "SYSTEM_ADMIN",
  "PLATFORM_ADMIN",
]);

export const jurisdiction = pgEnum("Jurisdiction", ["KE", "UG", "TZ", "RW", "EU"]);

export const orgs = pgTable("Org", {
  id: text().primaryKey(),
  name: text().notNull(),
  jurisdiction: jurisdiction().notNull().default("KE"),
  aocNumber: text(),
  createdAt: timestamp({ precision: 3 }).notNull().defaultNow(),
});

export const users = pgTable("User", {
  id: text().primaryKey(),
  orgId: text().notNull().references(() => orgs.id, { onDelete: "cascade" }),
  email: text().notNull().unique(),
  passwordHash: text().notNull(),
  name: text().notNull(),
  role: role().notNull().default("FRONTLINE"),
  mfaSecret: text(),
  active: boolean().notNull().default(true),
  createdAt: timestamp({ precision: 3 }).notNull().defaultNow(),
});

export const refreshTokens = pgTable("RefreshToken", {
  id: text().primaryKey(),
  userId: text().notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text().notNull().unique(),
  expiresAt: timestamp({ precision: 3 }).notNull(),
  revokedAt: timestamp({ precision: 3 }),
  createdAt: timestamp({ precision: 3 }).notNull().defaultNow(),
});
