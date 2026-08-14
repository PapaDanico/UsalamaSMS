-- Element 3.1 — "a record of what happened the last time one was
-- crossed", which is the element's own evidence definition and the last
-- thing standing between it and being claimable.
--
-- ATTACHED TO THE PERIOD, NOT TO AN ALERT LEVEL. The level is derived
-- by alertLevels() on every read and is deliberately never stored
-- (charter rule 6). Hanging the response off it would mean either
-- storing a level that can go stale, or orphaning the note the moment a
-- later period moved the baseline underneath it.
--
-- BOTH NULLABLE, AND NOT REQUIRED WHEN A LEVEL IS CROSSED. A product
-- that refuses to accept the numbers until somebody has written the
-- response is a product whose numbers get kept in a spreadsheet
-- instead.
--
-- actionOn is separate from createdAt on purpose: createdAt is when the
-- row was typed, actionOn is when the operator acted. Recording last
-- quarter's response this morning is the ordinary case, and conflating
-- them would date every response to the day of data entry.
--
-- ADDITIVE ONLY. Existing periods keep their meaning: a period with no
-- recorded action is a period whose response was not written down,
-- which is exactly what it was before this column existed.

ALTER TABLE "SpiPeriod" ADD COLUMN "actionTaken" TEXT;
ALTER TABLE "SpiPeriod" ADD COLUMN "actionOn" TIMESTAMP(3);
