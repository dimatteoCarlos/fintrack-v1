// frontend/src/fintrack/pages/tracker/trackerMessages.ts

// Every message the five tracker movement forms put on screen, and how long each
// class of message stays. Each form used to declare its own wording and its own
// timer, so one prompt was said in four ways and cleared after three delays.

export type EmptyListKindType =
 | 'bank'
 | 'investment'
 | 'bank_and_investment'
 | 'income_source'
 | 'debtor'
 | 'category';

export type EmptyListCaseType = 'none' | 'notOpenOnDay';

export type KindConfigType = {
 subject: string;
 linkLabel: string;
 to: string;
 // Whether that kind's creation form can date the opening before today. Where it
 // cannot, the link on the notOpenOnDay case would send the owner to a form that
 // opens the account today and still leaves the chosen day unusable.
 canBackdateOpening: boolean;
};

export type CaseMessagePartsType = {
 subject: string;
 // The verb phrase the sentence ends with, e.g. 'record an expense'.
 action: string;
 // Both already rendered for reading, e.g. 'Jul 4, 2026'.
 chosenDay: string;
 earliestOpeningDay: string;
 canBackdateOpening: boolean;
};

// Split in two because each half is painted differently: the fact carries the
// warning colour and the instruction stays in the reading colour.
export type CaseMessageTextType = {
 fact: string;
 instruction: string;
};

export type CaseMessageType = {
 text: (parts: CaseMessagePartsType) => CaseMessageTextType;
 withLink: (canBackdateOpening: boolean) => boolean;
};

// The wording more than one of the five forms says. A string only one form says
// stays in that form.
export const TRACKER_MESSAGES = {
 // Compared by identity to pick the tone the message is painted and announced
 // with, so a form has to send this exact string rather than a copy of its words.
 correction: 'Please correct the highlighted fields.',
 submissionFailure: 'An unexpected error occurred during submission.',
 validationFailure: 'Validation failed. Please check your inputs.',
 processing: 'Processing transaction...',
 transactionRecorded: 'Transaction recorded successfully!',
 // Field-level prompts, rendered under the control rather than on the message
 // channel. Two of the five forms word each of them identically.
 accountFieldRequired: '* Please select an account',
 noteFieldRequired: '* Please write the note',
} as const;

// How long a message stays before the form clears it.
export const MESSAGE_DURATION = {
 // Anything the owner has to act on: a correction prompt or a failure.
 action: 5000,
 // Anything that only reports what already happened.
 confirmation: 3000,
} as const;

// The subject is plural so "No <subject> yet. Create one to <action>." reads
// right for every kind. Routes are absolute: the tracker screens sit at
// different depths, and a relative link would resolve differently on each.
export const KIND_CONFIG: Record<EmptyListKindType, KindConfigType> = {
 bank: {
  subject: 'bank accounts',
  linkLabel: 'New account',
  to: '/fintrack/overview/new_account',
  // NewAccount.tsx:502 offers a Starting Point datepicker.
  canBackdateOpening: true,
 },
 // Transfer names its two legs by one account type each, so it needs the
 // investment kind on its own rather than the combined one the PnL screen uses.
 investment: {
  subject: 'investment accounts',
  linkLabel: 'New account',
  to: '/fintrack/overview/new_account',
  canBackdateOpening: true,
 },
 bank_and_investment: {
  subject: 'bank or investment accounts',
  linkLabel: 'New account',
  to: '/fintrack/overview/new_account',
  canBackdateOpening: true,
 },
 income_source: {
  subject: 'income sources',
  linkLabel: 'New account',
  to: '/fintrack/overview/new_account',
  canBackdateOpening: true,
 },
 debtor: {
  subject: 'debtor profiles',
  linkLabel: 'New profile',
  to: '/fintrack/debts/debtors/new_profile',
  // NewProfile.tsx gained a Starting Point picker; it sends both the opening day
  // and the day of the loan movement. The server still refuses a day earlier
  // than the funding bank account's own opening day.
  canBackdateOpening: true,
 },
 category: {
  subject: 'budget categories',
  linkLabel: 'New category',
  to: '/fintrack/budget/new_category',
  // NewCategory.tsx gained a Starting Point picker, and the month badge above
  // the form follows it.
  canBackdateOpening: true,
 },
};

// One entry per empty case. Loading and fetch failures are deliberately not
// cases here: each screen already handles them before it reaches this notice.
export const CASE_MESSAGES: Record<EmptyListCaseType, CaseMessageType> = {
 none: {
  text: ({ subject, action }) => ({
   fact: `No ${subject} yet.`,
   instruction: `Create one to ${action}.`,
  }),
  withLink: () => true,
 },
 // Both days are named because both are ways out, and the second one is the only
 // way out for a kind whose creation form cannot date an opening in the past.
 notOpenOnDay: {
  text: ({ subject, chosenDay, earliestOpeningDay, canBackdateOpening }) => ({
   fact: `No active ${subject} as of ${chosenDay}.`,
   instruction: canBackdateOpening
    ? `Open one dated on or before that day, or pick a day from ${earliestOpeningDay}.`
    : `Pick a day from ${earliestOpeningDay}.`,
  }),
  withLink: (canBackdateOpening) => canBackdateOpening,
 },
};

// Answers whether a notice of that kind and case would render a link, so a screen
// showing two notices can grant the link to one of them without restating which
// kinds and cases carry one.
export function noticeCarriesLink(
 kind: EmptyListKindType,
 emptyCase: EmptyListCaseType | null | undefined,
): boolean {
 if (!emptyCase) return false;

 return CASE_MESSAGES[emptyCase].withLink(KIND_CONFIG[kind].canBackdateOpening);
}
