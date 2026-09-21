### Technical Architecture: Internal "Slack" Account

The system implements an internal, non-user-facing account designated as **Slack**. This component functions as a **Technical Clearing Account** (Bridge Account) used to maintain ledger equilibrium for two non-transfer movement types: account opening and PnL (valuation gain or loss).

The Slack account is of the **`boundary`** account type: it represents the edge of the user's own accounts, the counterparty of movements whose other side lies outside them (the money an account starts with, and value gained or lost). Activity queries exclude every `boundary` account.

#### Methodology
The Slack account serves as the formal counterparty for non-transfer movements, specifically for **Initial Balances (Opening Accounts)** and the recognition of **Net Gains or Losses**.

*   **Account Opening:** To establish an initial balance, the system records a **Deposit (+)** in the user account and a corresponding **Withdrawal (–)** from the Slack account.
*   **Gains and Losses:** Fluctuations in value that do not involve another user-defined account are recorded against the Slack account to maintain transactional duality.

#### Operational Visibility and Role
The Slack account is structurally hidden from the user and excluded from standard balances and reports. Its activity becomes relevant in one live scenario, and one withdrawn method worth knowing exists in the code but is unreachable:

1.  **Reconciliation:** It provides the mathematical offset required to ensure that the sum of all accounts remains in equilibrium.
2.  **Account Annulment (withdrawn):** The account-erasure method that absorbed a deleted account's historical interactions into Slack — Retrospective Total Annulment (RTA) — was replaced by account closure after testing showed it could undo movements on accounts the user never touched (see `README.md`, "Account Deletion Method Applied"). The code path still exists in `deleteAccountService.js` but the API refuses every `deletionType` except `CLOSE`. Closing an account does not touch the Slack account at all.

#### Technical Logic Summary


| Event | User Account Impact | Slack Account Impact | Purpose |
| :--- | :--- | :--- | :--- |
| **Opening Balance** | (+) Deposit | (–) Withdrawal | Establishing initial value |
| **Valuation Gain** | (+) Deposit | (–) Withdrawal | Asset appreciation |
| **Valuation Loss** | (–) Withdrawal | (+) Deposit | Asset depreciation |
| **Account Annulment** *(withdrawn, see above)* | (–) Erasure | (+) Reconciliation | Rebalancing the ledger |

#### Rationale and Convenience
In professional accounting, this methodology aligns with the use of an [Equity Account](https://www.investopedia.com) or a [Suspense Account](https://www.investopedia.com).

*   **Ledger Invariant:** The system maintains the invariant `Sum(User Accounts) + Slack Account = 0`.
*   **Zero-Sum Verification:** Provides a continuous internal audit mechanism to verify that no currency units have been lost or created through database errors.
