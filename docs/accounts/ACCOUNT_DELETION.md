# Account Deletion — Methods Evaluated and What Shipped

📖 ACCOUNT DELETION METHODS: DOUBLE-ENTRY Accounting Implications

It was very interesting to evaluate the different methods that could be applied to manage account deletion and maintain the system integrity. This document describes the various approaches reviewed for deleting accounts, classifying their impact on the integrity of the double-entry bookkeeping system and the balance of active accounts (account_balance), and then states which one shipped and how it works today.

## Methods evaluated

### 1. SOFT DELETE (Logical Deletion)
The Soft Delete is the safest and least destructive approach. Instead of physical removal, the account row is simply marked with a deleted_at timestamp.

Main Purpose: Archiving and Reversibility. It is used to inactivate unused accounts.

Impact on Active Balance: The balance of active accounts remains unaltered (None).

CASCADE Effect: None. All transaction history is retained.

Advantage: The account is Fully Auditable and Reversible.

Best Practice / Role: Standard for the End-User.

### 2. HARD DELETE CLASSIC (Simple Physical Deletion)
This method involves direct physical deletion (DELETE) without any compensating accounting logic.

Main Purpose: Simple space release.

Impact on Active Balance: Causes Immediate Corruption in double-entry bookkeeping. By deleting a transaction (e.g., an expense) without compensating for the cash outflow, the active balance is broken.

CASCADE Effect: Total. The account and all associated transactions are deleted.

Disadvantage: Unusable in Accounting. It destroys active balance integrity.

Best Practice / Role: None (Only for testing/development).

### 3. HARD DELETE ATOMIC (Balance Preservation)
This is the accepted best practice method for hard deletion in accounting systems. It combines physical deletion with an atomic settlement to maintain balance integrity.

Main Purpose: Destroy Detailed History of the Target account, but MAINTAIN the current financial reality of active accounts.

Impact on Active Balance: The active balance is Preserved (None). A single PnL/Slack transaction (neutralizing adjustment) is inserted immediately before the final DELETE to exactly neutralize the impact of the deleted transactions.

CASCADE Effect: Total. The detailed history is replaced by the single PnL entry.

Advantage: Safe and Atomic. It adheres to the Core Accounting Principle of preserving the final balance.

Best Practice / Role: Accepted by Double-Entry Accounting. (Admin/Maintenance).

### 4. RETROSPECTIVE TOTAL ANNULMENT (RTA)
This method focuses on the retroactive correction of balances, fulfilling the intent that the Target account's interactions "never existed."

Main Purpose: Rewrite History and retroactively annul all effects of the Target account, deliberately altering the final balance.

Impact on Active Balance: The active balance Changes (Corrected). The PnL/Slack entry reverses the net flow (e.g., increasing the Bank balance from $500 to $600 by annulling a $100 expense).

CASCADE Effect: Total. The detailed history is deleted and replaced by the correcting PnL entry.

Disadvantage: Destroys Historical Reality. The new balance was not the true financial state in the past.

Best Practice / Role: Administrator/Audit (Emergency use for data correction).

### 5. RTA WITH HISTORY RETENTION (RTA-RH)
A complex, specialized variant of RTA that prioritizes the retention of all historical records, even after annulment.

Main Purpose: Annul the effect on the balance while maintaining an immutable record of the original interaction for internal audit or compliance.

Impact on Active Balance: The balance Changes (Corrected), similar to RTA.

CASCADE Effect: None/Conditional. Transactions are retained but are marked (e.g., status='annulled').

Disadvantage: High Risk of Double Counting. This creates extreme complexity in reporting, as the transaction history no longer sums up to the recorded balance.

Best Practice / Role: Database Admin/Maintenance. (Only for specific legal retention requirements).

## Method applied

The first method implemented was number 4, Retrospective Total Annulment (RTA), chosen for critical data correction: it erased the account and its transactions and wrote one annulment entry per counterpart account, against the compensation account, so current balances reflected the account never having existed.

After several rounds of testing, RTA proved too risky for an ordinary user action. Undoing the movements of the deleted account also undid them on every account that had interacted with it, changing the balances and the history of accounts the user never touched. Each of those accounts had interacted with others in turn, so the annulment risked becoming an event that expanded recursively, tending to wipe out most of the historical transactions. It also erased the account's own history for good, a problem hard delete shares.

RTA was therefore replaced by the account closure method. Hard delete and soft delete were withdrawn with it; all three remain in the code but are refused by the API, and CLOSE is the only deletion type it accepts.

## Account closure implemented

Principle: closing an account is a lifecycle event, not an accounting one. It removes the account and keeps its identity and its history. It settles nothing, transfers nothing and writes no transaction on the user's behalf.

What a close does, in order, inside one database transaction (all of it commits or none of it does):

1. **Lock and assess.** The account is locked and its balance is derived from the ledger, not read from the stored column.
2. **Zero-balance rule.** Bank, cash, investment and debtor accounts must be at zero. A close on one holding money is refused, and the user either moves the balance out with an ordinary transfer, or chooses **reverse the balance and close** (below). Income source, category budget and pocket saving accounts close at any balance: their figure is what flowed through them, not money they hold (see [Account Classes: Positions and Flows](../../README.md#account-classes-positions-and-flows) in the root README).
3. **Pockets released.** Every commitment the account was backing is released through the pocket module, so no pocket stays funded by an account that no longer exists.
4. **Budget stopped.** A category budget account gets a zero allocation on the current month; past months keep their amounts and nothing carries forward.
5. **Identity recorded.** The account's name, type, currency, starting amount, dates, category fields, closing date, who closed it and the mandatory **close reason** (up to 255 characters) are written to `account_registry`.
6. **Account removed.** The type's extension row and the `user_accounts` row are deleted. The name is free again for a new account.

Reverse the balance and close: the one option offered when the balance blocks a close. The user chooses only whether to use it; the amount is the negation of the balance and the counterpart is the system compensation account. Two ledger legs (movement type 11, both naming the closed account in `reversal_of_account_id`) bring the account to zero, the balance is derived again, and the close proceeds only if it is exactly zero.

Why history survives: every transaction, pocket allocation and budget month points at `account_registry` rather than at `user_accounts`, so they still resolve after the account row is gone. Balances of other accounts are never rewritten.
