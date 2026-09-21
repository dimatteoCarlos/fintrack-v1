/**
 * The deletion options of one account and what each costs, readable before a type is chosen. They form an
 * order, not a menu: hard delete refuses a nonzero residual and names RTA. No lock is taken (it would end
 * before the owner confirms); the execution path re-derives under its own lock. Figures share its service.
 */

import {
 getAnnulmentImpactReport,
 getPocketAllocationImpact,
 getUnattributedAnnulmentTotal,
 foldNetAdjustmentTotal,
} from './getAnnulmentImpactReport.js';

import { getClosePreview } from './getClosePreview.js';

import {
 DELETION_TYPE_CLOSE,
 DELETION_TYPE_HARD,
 DELETION_TYPE_RTA,
 DELETION_TYPE_SOFT,
 SOFT_DELETION_ENABLED,
 RTA_DELETION_ENABLED,
 HARD_DELETION_ENABLED,
} from '../../controllers/accountDeleteController.js';

/**
 * Assess every deletion type for one live account.
 *
 * @param {object} db - pool; a read that takes no lock
 * @returns {Promise<object>} the account, the options, and the pocket backing
 *   that some of those options destroy
 */
export const assessAccountDeletion = async (db, userId, targetAccountId) => {
 // First and alone because it is the one call that can refuse: it 404s for a missing, foreign, closed or
 // deleted account, so no impact report is wasted on one.
 const closePreview = await getClosePreview(db, userId, targetAccountId);

 const [impactReport, unattributed, pocketImpact] = await Promise.all([
  getAnnulmentImpactReport(db, userId, targetAccountId),
  getUnattributedAnnulmentTotal(db, userId, targetAccountId),
  getPocketAllocationImpact(db, userId, targetAccountId),
 ]);

 // Text on the way out, because the close confirmation echoes it back and the driver's
 // float conversion would round it in transit. Parsed here only to decide what the engine
 // allows, never published as a number.
 const residual = parseFloat(closePreview.targetAccount.residual);

 // Exact, not a tolerance: the hard-delete refusal tests parseFloat(balance) !== 0 on the same derived
 // balance as the close preview; any other test could offer an option the engine refuses with a 409.
 const isSettled = residual === 0;

 // Balance the annulment's own rows do not explain: residual less what RTA moves to other accounts and what
 // an earlier deletion reversed. Expected zero; published to show when it is not, as the residual and the
 // impact report come from different sources and agree only by construction. Rounded to cents, display only.
 const totalNetAdjustmentAmount = foldNetAdjustmentTotal(impactReport);
 const unreversedResidualAmount =
  Math.round(
   (residual - totalNetAdjustmentAmount - unattributed.amount) * 100,
  ) / 100;

 return {
  targetAccount: closePreview.targetAccount,

  // Shared, not repeated per option: the pockets this account backs are the same whichever
  // type is chosen; each option states whether it destroys them.
  pocketImpact,

  options: [
   {
    deletionType: DELETION_TYPE_CLOSE,
    // CLOSE refuses a nonzero balance outright, so offering it for a funded account
    // would send the owner to a 400 they could not predict.
    available: isSettled,
    // The refusal quoted before the owner meets it, in the same shape as HARD; the ways
    // out are a transfer, or the reversal the close runs itself.
    reason: isSettled
     ? undefined
     : `This account holds ${closePreview.targetAccount.residual} and cannot be closed until that is zero. Move the balance out with a transfer, or reverse the balance and close in one step.`,
    // True when the owner must settle a balance before CLOSE will run at all; CLOSE itself
    // settles nothing.
    requiresSettlement: !isSettled,
    // Frozen empty upstream (see getClosePreview.js); kept so a consumer reads an empty
    // list, not undefined.
    destinations: closePreview.destinations,
    destinationCount: closePreview.destinationCount,
    // No policy to pick: CLOSE disposes of no residual. The key stays with an empty list
    // so a radio group rendered over it shows nothing.
    availablePolicies: [],
    // CLOSE's first step releases every allocation the account backs, through the pocket
    // module's own release, per (pocket, source account) pair.
    removesPocketAllocations: true,
    // account_registry keeps the account's identity under the same account_id, so every
    // transaction, pocket allocation and budget month naming it still resolves.
    keepsHistory: true,
    // Informational: verifyAccountExistence.js alone decides whether a name can be reused.
    releasesAccountName: true,
   },
   {
    deletionType: DELETION_TYPE_SOFT,
    // Refused by the engine while the flag is off, so offering it would send the owner to a 403.
    available: SOFT_DELETION_ENABLED,
    reason: SOFT_DELETION_ENABLED
     ? undefined
     : 'Soft deletion is disabled in this version. Close the account instead.',
    // Nothing is settled or reversed: the account stops circulating while still holding its
    // balance, which is why the residual is shown beside this option.
    leavesResidualUnsettled: !isSettled,
    // SOFT releases pocket backing through the same helper CLOSE uses, before it writes
    // deleted_at: a deletion of any type must stop backing a pocket.
    removesPocketAllocations: true,
    keepsHistory: true,
    // Informational: verifyAccountExistence.js alone decides whether a name can be reused.
    releasesAccountName: false,
   },
   {
    deletionType: DELETION_TYPE_RTA,
    // Refused by the engine while the flag is off. The report below is still computed: it
    // is a read, and the related-accounts panel is built from the same figures.
    available: RTA_DELETION_ENABLED,
    reason: RTA_DELETION_ENABLED
     ? undefined
     : 'RTA deletion is disabled in this version. Close the account instead.',
    impactReport,
    affectedAccountsCount: impactReport.length,
    totalNetAdjustmentAmount,
    // Beside the total, never inside it: an earlier deletion already reversed these
    // amounts, so the execution path acts on none of them.
    unattributedAmount: unattributed.amount,
    unattributedTransactionCount: unattributed.transactionCount,
    // HARD's reason names this option as the way forward from a nonzero residual, so the
    // owner must be able to see that RTA does not settle the residual, it erases it.
    unreversedResidualAmount,
    erasesUnsettledResidual: unreversedResidualAmount !== 0,
    removesPocketAllocations: true,
    keepsHistory: false,
    releasesAccountName: true,
   },
   {
    deletionType: DELETION_TYPE_HARD,
    // Refused by the engine while the flag is off, whatever the balance; the balance
    // reason below applies only once it is back on.
    available: HARD_DELETION_ENABLED && isSettled,
    // The engine's own 409 quoted in advance: CLOSE leads and RTA follows, since an owner done with an
    // account wants the residual moved out, while RTA reverses its effect on OTHER accounts.
    reason: !HARD_DELETION_ENABLED
     ? 'Hard deletion is disabled in this version. Close the account instead.'
     : isSettled
     ? undefined
     : `This account holds ${closePreview.targetAccount.residual} and cannot be erased until that is settled. CLOSE refuses the same balance, so move it out with a transfer first, or use RTA if the account's effects on other accounts should be reversed.`,
    removesPocketAllocations: true,
    keepsHistory: false,
    releasesAccountName: true,
   },
  ],
 };
};
