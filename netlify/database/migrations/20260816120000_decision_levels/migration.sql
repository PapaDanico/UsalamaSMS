-- WHO MAY DECIDE TOLERABILITY, which L.N. 32 1.2.1(e) makes the
-- operator's declaration rather than this product's assumption.
--
-- Keyed by tolerability band, valued by post code. INTOLERABLE is
-- never a key: normaliseConfig() drops it before anything reaches this
-- column, because no level of management may accept a red risk.
ALTER TABLE "OrgConfig" ADD COLUMN "decisionLevels" JSONB;
