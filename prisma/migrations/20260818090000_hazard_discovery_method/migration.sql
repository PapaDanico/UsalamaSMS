-- HOW A HAZARD WAS FOUND, against ICAO's three methods.
--
-- Annex 19 asks for a formal hazard identification process "based on a
-- combination of reactive, proactive and predictive methods of safety
-- data collection". `Hazard.source` holds two values — REPORT and
-- REGISTER — which answer whether a hazard arrived on a report or was
-- typed in, and collapse every proactive and predictive route into
-- REGISTER. The combination could not be evidenced.
ALTER TABLE "Hazard" ADD COLUMN "discovery" TEXT;

-- THE ONLY BACKFILL THAT IS NOT AN INVENTION.
--
-- A hazard carrying a reportId arrived on an occurrence report, and
-- that is reactive by the instrument's own definition — the fact is in
-- the row, not inferred.
--
-- EVERYTHING ELSE STAYS NULL. `source = 'REGISTER'` means somebody
-- typed it, which is equally true of a workshop finding, an audit
-- finding and a note from a meeting. Mapping those to PROACTIVE would
-- manufacture the evidence the operator is being asked for, so they are
-- reported as unknown until somebody says.
UPDATE "Hazard" SET "discovery" = 'REPORT' WHERE "reportId" IS NOT NULL;

-- Read per organisation when the register renders its balance.
CREATE INDEX "Hazard_orgId_discovery_idx" ON "Hazard" ("orgId", "discovery");
