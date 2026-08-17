-- Which national High-Risk Category an indicator bears on, if any.
--
-- NULLABLE ON PURPOSE. An operator's safety performance indicators are
-- theirs to choose; nothing in Kenya's National Aviation Safety Plan is
-- a requirement placed on an operator. A NOT NULL column with a default
-- would make every indicator already in the table claim a category
-- nobody picked, which is this product putting words in an operator's
-- mouth about what they are measuring for their regulator.
--
-- No CHECK constraint against the code list, deliberately: the list
-- lives in packages/shared/src/taxonomy.ts and a copy in the database
-- is a second source of truth that drifts. The API validates on write.
ALTER TABLE "Spi" ADD COLUMN "hrc" TEXT;

-- The rollup reads every indicator for one operator and groups by
-- category, so orgId leads. Partial, because the null rows are the ones
-- the rollup has nothing to say about.
CREATE INDEX "idx_spi_org_hrc" ON "Spi" ("orgId", "hrc") WHERE "hrc" IS NOT NULL;
