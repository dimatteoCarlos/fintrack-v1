// Prefix in transactions.description marking RTA annulment rows; a text convention, not a key like
// reversal_of_account_id (migration 037), so do not reuse it. Five overview predicates read it (some
// exclude, overviewInvestmentRepository.js includes), so changing the string silently breaks them.
export const RTA_ANNULMENT_TARGET_PREFIX = 'RTA Annulment Target(';
