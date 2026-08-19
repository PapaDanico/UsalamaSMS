/** The provenance of a regulatory figure this product surfaces. */
export const REGULATORY_SOURCE_LEVELS = [
  "PRIMARY",
  "REGIONAL_GUIDANCE",
  "PROVISIONAL",
  "OPERATOR_DECLARED",
] as const;

export type RegulatorySourceLevel = (typeof REGULATORY_SOURCE_LEVELS)[number];

export const REGULATORY_SOURCE_LABELS: Readonly<Record<RegulatorySourceLevel, string>> = Object.freeze({
  PRIMARY: "primary instrument read",
  REGIONAL_GUIDANCE: "regional guidance",
  PROVISIONAL: "primary instrument unread",
  OPERATOR_DECLARED: "operator declared",
});

/** Regional frameworks named in the product rather than left implicit. */
export const REGIONAL_FRAMEWORKS = ["CASSOA"] as const;
export type RegionalFramework = (typeof REGIONAL_FRAMEWORKS)[number];

export const REGIONAL_FRAMEWORK_LABELS: Readonly<Record<RegionalFramework, string>> = Object.freeze({
  CASSOA: "CASSOA / East African Community harmonisation",
});
