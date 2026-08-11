// Prisma 7 configuration — connection URL lives here, not in the schema.
import { defineConfig } from "prisma/config";
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: { url: process.env["DATABASE_URL"] ?? "postgresql://localhost:5432/usalamasms" },
});
