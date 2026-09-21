// Level-2 depths, since a domain's analyses differ enormously in price. derived: only data level 1
// already fetched, reshaped. full: also runs statements for the first time (income by source,
// contribution history, per-account distributions, debt legs). Absent returns the level-1 response.
export const ANALYSIS_DERIVED = 'derived';
export const ANALYSIS_FULL = 'full';

// Declared once and read by the validator so the schema and the services cannot disagree on what a level is.
export const ANALYSIS_LEVELS = [ANALYSIS_DERIVED, ANALYSIS_FULL];

/** Whether the request asked for the analyses that need their own statements. */
export const isFullAnalysis = (analysis) => analysis === ANALYSIS_FULL;

/** Whether the request asked for an analysis section at all. */
export const wantsAnalysis = (analysis) => ANALYSIS_LEVELS.includes(analysis);
