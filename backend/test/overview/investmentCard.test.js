// Contract tests for the investment card. The three-term comparison is a check, not an
// identity (the right side is the whole derived balance, so an unlisted movement type
// breaks it); the tests cover both the closing and the reporting outcome.

import test from 'node:test';
import assert from 'node:assert/strict';

import { makeInvestmentCard } from '../../src/fintrack_api/services/overview_services/core/makeInvestmentCard.js';

const base = {
 capitalContributed: 1000,
 ledgerBalance: 1100,
 realizedPnl: 100,
 closureAdjustment: 0,
 largestBalance: 700,
 daysSinceLastContribution: 12,
 currency: 'usd',
};

const emptyPortfolio = {
 ledgerBalance: 0,
 capitalContributed: 0,
 realizedPnl: 0,
 daysSinceLastContribution: null,
};

test('the two withheld-concentration cases are told apart by a field', () => {
 // Both notices say in words why concentration is withheld; accountCount gives a
 // client that renders figures a field to branch on, telling an owner with no
 // investment account from one whose accounts hold nothing.
 const noAccounts = makeInvestmentCard({ ...base, ...emptyPortfolio, accountCount: 0, largestBalance: null });
 const noMoney = makeInvestmentCard({ ...base, ...emptyPortfolio, accountCount: 2, largestBalance: 0 });

 assert.equal(noAccounts.accountCount, 0);
 assert.equal(noAccounts.concentration, null);
 assert.equal(noMoney.accountCount, 2);
 assert.equal(noMoney.concentration, null);
 assert.notEqual(noAccounts.accountCount, noMoney.accountCount);
});

test('the three terms closing against the balance fires no notice', () => {
 const card = makeInvestmentCard({ ...base, accountCount: 2 });

 assert.equal(card.meta.notices.length, 0);
 assert.equal(card.accountCount, 2);
});

test('a balance the three terms do not account for fires one notice', () => {
 const card = makeInvestmentCard({ ...base, accountCount: 2, ledgerBalance: 1150 });

 assert.equal(card.meta.notices.length, 1);
});

test('the disagreement is reported as a sentence and never as a figure', () => {
 // The server publishes the terms, never their difference: a client subtracting in
 // floating point could find a cent the decimal comparison did not and tell the
 // owner their books are broken.
 const card = makeInvestmentCard({ ...base, accountCount: 2, ledgerBalance: 1150 });

 assert.equal(Object.hasOwn(card, 'reconciliationDifference'), false);
 assert.equal(card.ledgerBalance, 1150);
 assert.equal(card.capitalContributed, 1000);
 assert.equal(card.realizedPnl, 100);
 assert.equal(card.closureAdjustment, 0);
});

test('the closure adjustment is a real term of the comparison', () => {
 const card = makeInvestmentCard({
  ...base,
  accountCount: 1,
  closureAdjustment: -50,
  ledgerBalance: 1050,
  largestBalance: 1050,
 });

 assert.equal(card.meta.notices.length, 0);
 assert.equal(card.concentration, 1);
});

test('the card is frozen', () => {
 assert.equal(Object.isFrozen(makeInvestmentCard({ ...base, accountCount: 2 })), true);
});

test('the card carries the transaction count the page has to sum', () => {
 // transactionCountAll sums one count per domain and no other counts investment movements;
 // the field must equal the number handed in, not merely be non-zero.
 const card = makeInvestmentCard({ ...base, accountCount: 2, transactionCount: 7 });

 assert.equal(card.transactionCount, 7);

 // Zero is a real answer and not an absent one: an owner with investment
 // accounts and no movement this month contributes 0 to the page total.
 const quiet = makeInvestmentCard({ ...base, accountCount: 2, transactionCount: 0 });

 assert.equal(quiet.transactionCount, 0);
});
