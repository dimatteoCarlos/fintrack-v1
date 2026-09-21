# 📊 Comparative Analysis of Development Approaches

This table contrasts the different methodologies implemented across the project for similar tasks (such as form handling, validation, and data management). See also [the form architecture case study](../forms/FORM_ARCHITECTURE.md), which walks each level below through an actual component.

---

| Level | Technical Approach | Reference Files | Contrast: Native vs. Professional Evolution |
|-------|-------------------|-----------------|---------------------------------------------|
| **1** | **Vanilla / Manual Logic** | `NewAccount.tsx`, `NewProfile.tsx` | **Manual Control**: Every input handler and validation message is managed via individual `useState` hooks. No external libraries are used, ensuring a deep understanding of React's reconciliation. |
| **2** | **Hybrid Architecture** | `Debts.tsx` | **Logic Separation**: Business logic starts moving into custom hooks, but validation remains manual and imperative to maintain granular control over the data flow. |
| **3** | **Advanced Hybrid** | `PnL.tsx` | **Centralized Management**: Introduction of specialized hooks like `useFormManagerPnL`. This centralizes the form lifecycle and handlers, reducing code repetition compared to the "Vanilla" approach. |
| **4** | **Industrial Standard** | `Transfer.tsx` | **Declarative Validation**: Transition to Zod Schemas. Instead of manual if/else checks, the data is validated against a schema contract, and state is managed by a generic `useFormManager`. |
| **5** | **Dynamic / Generic** | `UniversalDynamicInput.tsx` | **Metadata-Driven UI**: The highest level of abstraction. Instead of hard-coded JSX, a single component uses TypeScript Generics to render any input type based on a configuration object. |
| **6** | **Mass Orchestration** | `Overview.tsx` | **Parallel Execution**: Unlike single-fetch components, this uses **Parallel Fetching** to synchronize multiple data streams simultaneously, normalizing complex KPIs for the dashboard. |

## VIEW ACCOUNT DETAILS IN ACCOUNTING DASHBOARD
VIEW DETAILS:
Different approaches were applied for rendering detail info of the accounts, in order to compare and learn different methods.

The system employs a Hybrid Data Fetching Pattern 

 The AccountingDashboard fetches account data and transfers it via navigation state (react router). This state-based data serves as the primary, fastest source for the detail views. For generic accounts (AccountDetail), the full account object is passed, allowing for an immediate render.
 
  Conversely, for specific accounts (CategoryDetail), the dashboard passes a null value. This action forces the detail component to initiate an API Fallback using useFetch to retrieve complex, dynamic data directly from the server, ensuring data validity.
  
  All detail components use the same consumption logic (StateData || FetchResult) to handle both the instant load from state and the slower, resilient fetch from the API when state data is absent (e.g., after a page refresh).

  In PocketDetail, the pocket id is passed via route parameters, and the detail (pocket, funding accounts and commit/release history) is fetched through its own store, `usePocketDetailStore`. A pocket is not an account, so it has no entry in the accounting dashboard.

  
## ACCOUNT DATA EDITION.
ACCOUNT EDITION PHILOSOPHY
To maintain financial integrity and keep the application simple, the account editing module focuses on non-critical fields. Critical fields such as the account balance, account type, starting date, and initial amount are deliberately non-editable.

If a change to this core data is required, the application enforces the use of auditable mechanisms supplied, such as:

* Creating new direct or reversal transactions (Transfers or PnL adjustments).

* Or closing the erroneous account (see [Account Deletion](../accounts/ACCOUNT_DELETION.md)) and recreating it correctly.
