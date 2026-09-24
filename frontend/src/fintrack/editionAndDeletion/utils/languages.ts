// Dictionary (en, es) for the account deletion, closure and closed-account UI texts.
const languageOptions = ['en','es'] as const

export type LanguageKeyType = typeof languageOptions[number]

// Type guard: checks that a string is a supported language.
export function isLanguageTypeValid(lang:string):lang is LanguageKeyType {
 return languageOptions.includes(lang as LanguageKeyType)
}
export type DictionaryDataType ={
 //AccountDeletionPage
 pageTitle: string;

 //AccountDetailsUI.tsx
 accountDetailsTitle: string;
 accountIdLabel: string;
 accountNameLabel: string;
 actionLabel: string;
 accountTypeLabel: string;
 accountBalanceLabel: string;
 rtaDeletionAction: string;
 
 pendingDeletionStatus:string;

 reportErrorTitle: string;
 reportErrorMessage: string;
 proceedToDeletionButton: string;
 finalSuccessTitle: string;

 title: string;
 description: string;
 affectedAccounts: string;
 willBeAdjusted: string;

 //Pocket impact block (InitialConfirmationDeleteAccountUI)
 pocketImpactTitle: string;
 pocketImpactTotalLabel: string;
 pocketImpactNote: string;
 processing: string;
 apiError: string;
 clickToConfirm: string;
 cancel: string;
 confirmDeletion: string;
 confirmHardDelete: string;
 language: string;
 accountsImpacted: string;
 loading: string;

//StatusModalUI
 successTitle:string;
 errorTitle:string;
 closeButton:string;

 idleStatusConfirmationTitle:string;

//LoadingReportUI
 loadingReportText:string;
reportTitleNoImpact:string;
reportTitleWithImpact:string;

//NoImpactReportUI
 noImpactTitle: string;
 noImpactMessage: string;
 
 //ImpactReportUI
 impactDetectedTitle: string;
 impactDetectedMessage: string;
 tableOfAffectedAccountsDetails:string;
 affectedAccountColumn: string;
 affectedAccountTypeColumn:string,
 currentBalanceColumn: string;
 netAdjustmentColumn: string;
 newBalanceColumn: string;
 tableOfRelatedAccountsDetails: string;
 backButtonText: string;
 backWithoutClosingLabel: string;
 interactionsColumn: string;
 netMovedColumn: string;
 lastInteractionColumn: string;
 totalNetAdjustment: string; 
 unattributedAmount: string;
 unattributedNote: string;

 // Movement types for ImpactReportUI's interactions cell. Prefixed because 'investment' is also an
 // account type. Keys derive from the catalog name via movementLabelKey (hyphens become underscores).
 movement_expense:string;
 movement_income:string;
 movement_investment:string;
 movement_debt:string;
 movement_pocket:string;
 movement_transfer:string;
 movement_receive:string;
 movement_account_opening:string;
 movement_pnl:string;
 movement_account_closure:string;
 movement_balance_reversal:string;

 //account types for ImpactReportUI
 income_source:string;
 category_budget:string;
 debtor:string;
 investment:string;
 bank:string;
 // Also needed by the closed-account pill.
 cash:string;
 pocket_saving:string;

 autoCloseIn:string;

// PostOperationView
 postOperationSuccessTitle: string;
 postOperationSuccessSubtitle: string;
 postOperationErrorTitle: string;
 postOperationErrorSubtitle: string;
 operationIdLabel: string;
 deletedAccountLabel: string;
 operationTimeLabel: string;
 adjustmentResultsTitle: string;
 affectedAccountsCount: string;
 resultsTableNote: string;
 defaultSuccessMessage: string;
 nextStepsTitle: string;
 contactAdminInstruction: string;
 provideErrorIdInstruction: string;
 tryAgainLaterInstruction: string;
 accountLabel: string;
 errorTimeLabel: string;
 backToActionsButton: string;

// "Other deletion methods" section of AccountDeletionPage: SOFT and HARD alongside RTA.
 otherMethodsSectionTitle: string;
 otherMethodsSectionDescription: string;

 // Wording for the screen when CLOSE is the only method offered
 // (deletionMethodPolicy.ts). Separate keys rather than edits to the four
 // above, so turning the flag off restores the old wording.
 closeOnlyPageTitle: string;
 closeOnlyDetailsTitle: string;
 closeOnlyBlockedNotice: string;
 closeNetWorthSectionLabel: string;
 closeNetWorthBeforeLabel: string;
 closeNetWorthAfterLabel: string;
 closeNetWorthUnchangedNote: string;
 closedAccountsMenuItem: string;
 closedAccountsPageTitle: string;
 closedAccountsLede: string;
 closedAccountsSearchLabel: string;
 closedAccountsSearchPlaceholder: string;
 closedAccountsTypeLabel: string;
 closedAccountsTypeAll: string;
 closedAccountsSortLabel: string;
 closedAccountsSortClosedAt: string;
 closedAccountsSortName: string;
 closedAccountsSortType: string;
 closedAccountsSortCreatedAt: string;
 closedAccountsOrderToggle: string;
 closedAccountsOrderAsc: string;
 closedAccountsOrderDesc: string;
 // What the order button shows; the two sentences above become its aria-label.
 closedAccountsOrderAscShort: string;
 closedAccountsOrderDescShort: string;
 closedAccountsColumnName: string;
 closedAccountsColumnType: string;
 closedAccountsColumnClosedAt: string;
 closedAccountsColumnReason: string;
 closedAccountsColumnOpened: string;
 closedAccountsColumnStartingAmount: string;
 closedAccountsColumnCategory: string;
 closedAccountsNameUnknown: string;
 closedAccountsTypeUnknown: string;
 closedAccountsTotal: string;
 closedAccountsPageStatus: string;
 closedAccountsPreviousPage: string;
 closedAccountsNextPage: string;
 closedAccountsPerPage: string;
 closedAccountsEmptyTitle: string;
 closedAccountsEmptyMessage: string;
 closedAccountsNoMatchTitle: string;
 closedAccountsNoMatchMessage: string;
 closedAccountsClearFilters: string;
 closedAccountsErrorMessage: string;
 closedAccountsRetry: string;
 closedAccountsBackButton: string;
 relatedAccountsSummary: string;
 relatedAccountsNote: string;
 relatedAccountsHeading: string;
 relatedAccountsTitle: string;
 relatedAccountsLede: string;
 relatedAccountsLedeAdjustment: string;
 relatedAccountsNoneTitle: string;
 relatedAccountsNoneMessage: string;
 closeAccountBudgetWarning: string;
 closeOnlySectionTitle: string;
 closeOnlySectionDescription: string;
 closeAccountAction: string;

// SoftDeactivateAccountUI
 softDeactivateTriggerButton: string;
 softDeactivateTitle: string;
 softDeactivateDescription: string;
 softDeactivateConfirmButton: string;
 softDeactivateSuccessMessage: string;

// CloseAccountUI
 closeAccountTriggerButton: string;
 closeAccountTitle: string;
 closeAccountDescription: string;
 // Shown only for account_type 'bank': the only type a pocket can be funded from.
 closeAccountPocketNotice: string;
 closeAccountConfirmButton: string;
 closeAccountSuccessMessage: string;
 closeAccountBalanceLabel: string;
 closeAccountBlockedByBalance: string;
 closeAccountReverseTriggerButton: string;
 closeAccountReverseTitle: string;
 closeAccountReverseDescription: string;
 closeAccountReverseConfirmButton: string;
 closeAccountReversalNotice: string;
 closeReversalBoundaryStatement: string;
 closeAccountPreviewError: string;
 closeAccountReasonLabel: string;
 closeAccountReasonPlaceholder: string;
 closeAccountReasonHint: string;

// HardDeleteConfirmationUI
 hardDeleteTriggerButton: string;
 hardDeleteTitle: string;
 hardDeleteDescription: string;
 hardDeleteWarning: string;
 hardDeleteConfirmButton: string;
 hardDeleteSuccessMessage: string;

 }

export const defaultLanguage:LanguageKeyType='en';

// Values a sentence needs at render time, keyed by the name inside the entry's
// braces. Numbers are accepted so callers need not stringify amounts.
export type TranslationValuesType = Record<string, string | number>;

// Matches a placeholder written as {name}. Word characters only, so a brace in
// ordinary copy is not treated as the start of one.
const PLACEHOLDER_PATTERN = /\{(\w+)\}/g;

/**
 * Reads one entry and substitutes its {name} placeholders. Each entry holds the whole sentence because
 * word order differs between languages. A placeholder with no value stays visible: an empty string
 * would read correctly and say the wrong thing.
 */
export const getLangText = (lang:LanguageKeyType, key:keyof DictionaryDataType, values?:TranslationValuesType):string => {
 const entry = languages[lang]?.[key] || languages[defaultLanguage][key] || key;

 if (!values) return entry;

 return entry.replace(PLACEHOLDER_PATTERN, (placeholder, name:string) =>
  Object.prototype.hasOwnProperty.call(values, name)
   ? String(values[name])
   : placeholder,
 );
};

export const languages:Record<LanguageKeyType,DictionaryDataType> = {

 en:{
pageTitle: "Deletion and Account Annulment",

accountDetailsTitle: "Target Account Details (Deletion)",
 accountIdLabel: "ID:",
 accountNameLabel: "Name:",
 accountTypeLabel: "Type: ",
 accountBalanceLabel:'Balance: ',
 actionLabel:"Action: ",
 rtaDeletionAction: "RTA Deletion (Annulment with adjustment)",
 pendingDeletionStatus:"Pending deletion - Awaiting confirmation",

 reportErrorTitle: "Error Loading Report:",
 reportErrorMessage: "Cannot proceed with annulment.",
 proceedToDeletionButton: "Delete with adjustment",
 finalSuccessTitle: "Success!",

title:'Confirm Account Deletion',
description:'You are about to initiate the Retrospective Total Annulment (RTA) deletion method for this account. ', 
affectedAccounts:'account(s) will be adjusted.',
willBeAdjusted:'will be adjusted.',

pocketImpactTitle:'This account currently supports:',
pocketImpactTotalLabel:'Total allocated:',
pocketImpactNote:'Deleting this account removes these allocations from the affected pockets. The money itself is not deleted; only the pocket assignments are removed.',

processing:'Processing annulment...',
apiError: "⚠️ **API Error:**",
clickToConfirm:'Click Confirm to continue the annulment.',

cancel: 'Cancel',
confirmDeletion:'Confirm Deletion with financial adjustments (RTA)', 
confirmHardDelete:'Confirm Hard Deletion',

language:'Language',

accountsImpacted:'accounts impacted.',
loading:'Loading...',

successTitle:'Annulment Completed!',
errorTitle:'Deletion Error', 
closeButton:'Close', 

 idleStatusConfirmationTitle:'Need Your Confirmation',

loadingReportText:'Loading RTA Deletion Method Impact Report...',
reportTitleNoImpact:"Impact Report: No Accounts Affected",
reportTitleWithImpact:"Impact on Affected Accounts",

 noImpactTitle: 'No Financial Impact!',
 noImpactMessage: 'No affected accounts found. Proceeding with **Hard Delete**.',
 impactDetectedTitle: '⚠️ Impact Detected: {count} Affected Accounts',
 impactDetectedMessage: 'The annulment will automatically adjust balances to maintain financial consistency.',
 tableOfAffectedAccountsDetails:'Financial impact details on related accounts',
 affectedAccountColumn: 'Account',
 affectedAccountTypeColumn:'Type',
 currentBalanceColumn: 'Current Balance',
 netAdjustmentColumn: 'Net Adjustment',
 newBalanceColumn: 'New Balance',
 tableOfRelatedAccountsDetails: 'Accounts this one has operated with',
 backButtonText: 'Back',
 backWithoutClosingLabel: 'Back, without deleting this account',
 interactionsColumn: 'Interactions',
 netMovedColumn: 'Net Moved',
 lastInteractionColumn: 'Last Interaction',
 totalNetAdjustment: 'Total Net Adjustment:',
 unattributedAmount: 'Not attributable to any account:',
 unattributedNote:
  '{count} transactions an earlier deletion already reversed. Shown beside the total, not added to it.',

 // Labels for the interactions cell; the catalog names are identifiers such as
 // 'account-opening'.
 movement_expense: "Expense",
 movement_income: "Income",
 movement_investment: "Investment",
 movement_debt: "Debt",
 movement_pocket: "Pocket",
 movement_transfer: "Transfer sent",
 movement_receive: "Transfer received",
 movement_account_opening: "Account opening",
 movement_pnl: "Profit and loss",
 movement_account_closure: "Account deletion",
 movement_balance_reversal: "Balance reversal",

 income_source:'Income',
 category_budget:"Expense",
 debtor:"Debtor/Lender",
 investment:"Investment",
 bank:"Bank",
 cash:"Cash",
 pocket_saving:"Pocket",

 autoCloseIn:'Auto Close in ',

 postOperationSuccessTitle: "RTA Deletion Completed Successfully",
  postOperationSuccessSubtitle: "Account {targetAccountName} has been deleted",
  postOperationErrorTitle: "RTA Deletion Failed", 
  postOperationErrorSubtitle: "Could not delete account {targetAccountName}",
  operationIdLabel: "Operation ID",
  deletedAccountLabel: "Deleted Account",
  operationTimeLabel: "Operation Time",
  adjustmentResultsTitle: "Financial Adjustments Results",
  affectedAccountsCount: "Affected Accounts",
  resultsTableNote: "The affected accounts have been automatically adjusted to maintain financial consistency.",
  defaultSuccessMessage: "The RTA annulment has been completed successfully. All affected accounts have been adjusted.",
  nextStepsTitle: "Next Steps",
  contactAdminInstruction: "Contact the application administrator",
  provideErrorIdInstruction: "Provide the error details for investigation",
  tryAgainLaterInstruction: "Try again later or use a different method",
  accountLabel: "Account",
  errorTimeLabel: "Error Time",
  backToActionsButton: "Back to Accounting Dashboard",

  otherMethodsSectionTitle: "Other deletion methods",
  otherMethodsSectionDescription: "Prefer not to run the annulment above? Deactivate the account instead, or erase it permanently without reversing its impact on other accounts.",

  closeOnlyPageTitle: "Delete Account",
  closeOnlyDetailsTitle: "Account to Delete",
  closeOnlyBlockedNotice: "This account still has a balance. It is recommended to bring it to zero first: transfer it out and your net worth stays the same. Otherwise, use Reverse the Balance and Delete, which removes that amount from your net worth.",
  relatedAccountsSummary: "Related accounts",
  relatedAccountsNote: "New balance and net adjustment show what deleting this account with adjustment would do to each of these accounts. The deletion changes none of these figures.",
  relatedAccountsHeading: "Accounts this one has moved money with",
  relatedAccountsTitle: "This account has moved money with {count} accounts",
  relatedAccountsLede: "How many movements this account shares with each of them, and when the last one was. Deleting changes none of these accounts: the movements they share with it keep its name, because the deleted account is recorded before its row is removed.",
  relatedAccountsLedeAdjustment: "Two of the columns belong to the other route on this screen, not to deleting. New balance and net adjustment are what deleting this account WITH ADJUSTMENT would leave on each of these accounts. Deleting changes none of them.",
  relatedAccountsNoneTitle: "No shared movements",
  relatedAccountsNoneMessage: "This account has not moved money with any other account.",
  closeAccountBudgetWarning: "Its budget is set to zero from this month on; earlier months' budget amounts stay.",
  closeOnlySectionTitle: "Delete this account",
  closeOnlySectionDescription: "Deletion of an account cannot be undone. The account history stays readable.",
  closeAccountAction: "Delete",

  softDeactivateTriggerButton: "Deactivate Account",
  softDeactivateTitle: "Deactivate this account?",
  softDeactivateDescription: "This deactivates the account instead of erasing it. Its balance, transactions and history stay exactly as they are, and it can be reactivated later. No financial impact report is needed for this action.",
  softDeactivateConfirmButton: "Deactivate Account",
  softDeactivateSuccessMessage: "{targetAccountName} has been deactivated.",

  closeAccountTriggerButton: "Delete Account",
  closeAccountTitle: "Delete this account?",
  closeAccountDescription: "Deleting removes the account and keeps its history: transactions stay readable under the same name, which becomes available again. This cannot be undone: the account is not deactivated, it is removed, and there is no way to reopen it.",
  closeAccountPocketNotice: "Pocket commitments of {amount} from {name} (#{id}) will be released.",
  closeAccountConfirmButton: "Delete Account",
  closeAccountSuccessMessage: "{targetAccountName} has been deleted. Its history stays in the registry under the same name.",
  closeAccountBalanceLabel: "Balance to delete with:",
  closeAccountBlockedByBalance: "This account still holds {residual}. Transfer it out first, or reverse the balance and delete in one step.",
  closeAccountReverseTriggerButton: "Reverse the Balance and Delete",
  closeAccountReverseTitle: "Reverse the Balance and Delete",
  closeAccountReverseDescription: "FinTrack will move the whole balance to the compensation account and delete this account in one operation. If either part fails, neither happens.",
  closeAccountReverseConfirmButton: "Reverse and Delete",
  closeNetWorthSectionLabel: "What this does to your net worth",
  closeNetWorthBeforeLabel: "Net worth now",
  closeNetWorthAfterLabel: "After deleting this account",
  closeNetWorthUnchangedNote: "This account is not counted in net worth, so deleting it does not change that figure.",

  closedAccountsMenuItem: "Deleted Accounts",
  closedAccountsPageTitle: "Deleted Accounts",
  closedAccountsLede: "Every account you have deleted, under the name it had. Deleting removes the account and keeps its record, so this list is what a deleted account leaves behind: when it was deleted, why, and what it was.",
  closedAccountsSearchLabel: "Search",
  closedAccountsSearchPlaceholder: "Name, reason or category",
  closedAccountsTypeLabel: "Type",
  closedAccountsTypeAll: "All types",
  closedAccountsSortLabel: "Sort by",
  closedAccountsSortClosedAt: "Date deleted",
  closedAccountsSortName: "Name",
  closedAccountsSortType: "Type",
  closedAccountsSortCreatedAt: "Date opened",
  closedAccountsOrderToggle: "Reverse the order",
  closedAccountsOrderAsc: "Oldest first",
  closedAccountsOrderDesc: "Newest first",
  closedAccountsOrderAscShort: "ASC",
  closedAccountsOrderDescShort: "DESC",
  closedAccountsColumnName: "Account",
  closedAccountsColumnType: "Type",
  closedAccountsColumnClosedAt: "Deleted",
  closedAccountsColumnReason: "Reason",
  closedAccountsColumnOpened: "Opened",
  closedAccountsColumnStartingAmount: "Started with",
  closedAccountsColumnCategory: "Category",
  closedAccountsNameUnknown: "Name not recorded",
  closedAccountsTypeUnknown: "Type not recorded",
  closedAccountsTotal: "{total} deleted accounts",
  closedAccountsPageStatus: "Page {page} of {pageCount}",
  closedAccountsPreviousPage: "Previous page",
  closedAccountsNextPage: "Next page",
  closedAccountsPerPage: "Per page",
  closedAccountsEmptyTitle: "Nothing deleted yet",
  closedAccountsEmptyMessage: "When you delete an account, its record appears here and stays readable under the name it had.",
  closedAccountsNoMatchTitle: "No deleted account matches",
  closedAccountsNoMatchMessage: "Nothing here matches the search and filter you have set. Clearing them brings the whole list back.",
  closedAccountsClearFilters: "Clear search and filters",
  closedAccountsErrorMessage: "The deleted-account list could not be read.",
  closedAccountsRetry: "Try again",
  closedAccountsBackButton: "Back to Accounting Dashboard",

  closeAccountReversalNotice: "{residual} will be moved to the compensation account. The movement stays recorded.",
  closeReversalBoundaryStatement: "The compensation account is kept by the system and is not one of your accounts, so it sits outside your net worth. If it appears in the list below, that row is past history, not this reversal.",
  closeAccountPreviewError: "The balance could not be read, so the deletion cannot be offered yet.",
  closeAccountReasonLabel: "Reason for deletion (required)",
  closeAccountReasonPlaceholder: "e.g. Bank account closed at the branch",
  closeAccountReasonHint: "Saved in Deleted Accounts.",

  hardDeleteTriggerButton: "Erase Without Reversal",
  hardDeleteTitle: "Erase this account without reversing its impact?",
  hardDeleteDescription: "This permanently erases the account and its own transactions. It cannot be undone.",
  hardDeleteWarning: "Every counterparty's historical balance from transacting with this account is left exactly as it is - nothing gets corrected. This is different from the Retrospective Total Annulment above, which reverses that impact first. Choose this only when you explicitly do not want that correction.",
  hardDeleteConfirmButton: "Erase Without Reversal",
  hardDeleteSuccessMessage: "{targetAccountName} has been permanently erased.",

 }
 ,

 es:{
pageTitle: "Eliminación de Cuenta y Ajuste de Balances",

accountDetailsTitle: "Detalles de la Cuenta Objetivo (Borrar)",
 accountIdLabel: "ID: ",
 accountNameLabel: "Nombre: ",
 accountTypeLabel: "Tipo: ",
 accountBalanceLabel:'Balance: ',
 actionLabel: "Acción: ",
 rtaDeletionAction: "Eliminación de Cuenta y Ajuste de cuentas afectadas",
 pendingDeletionStatus: "Pendiente por eliminación de la cuenta - Esperando confirmación",

 reportErrorTitle: "Error al Cargar el Reporte:",
 reportErrorMessage: "No se puede proceder con la anulación.",
 proceedToDeletionButton: "Eliminar con ajuste",
 finalSuccessTitle: "¡Éxito!",

title: "Confirmar Eliminación de Cuenta",
description: "Está a punto de iniciar el proceso de Anulación Retrospectiva Total (ART) para esta cuenta.",
affectedAccounts: "cuenta(s) impactada(s) será(n) ajustada(s).",
willBeAdjusted: "serán ajustadas.",

pocketImpactTitle: "Esta cuenta actualmente respalda:",
pocketImpactTotalLabel: "Total asignado:",
pocketImpactNote: "Al eliminar esta cuenta se eliminan estas asignaciones de los pockets afectados. El dinero no se elimina; solo se elimina la asignación al pocket.",

processing: "Procesando anulación...",
apiError: "⚠️ **Error de API:**",
clickToConfirm: "Haga clic en Confirmar para continuar la anulación.",

cancel: "Cancelar",
confirmDeletion: "Confirmar Anulación RTA",
confirmHardDelete: "Confirmar Borrado Permanente",
language: "Idioma",

accountsImpacted: "cuentas impactadas.",
loading: "Cargando...", 

successTitle: '¡Anulación Completada!',
errorTitle: 'Error en la Eliminación',
closeButton: 'Cerrar',

 idleStatusConfirmationTitle:'Requiere Confirmación',

loadingReportText:"Cargando Reporte de Impacto de cuentas. Metodo ART de eliminacion de cuentas...",

reportTitleNoImpact:"Reporte de Impacto: No hay cuentas Afectadas",
reportTitleWithImpact:"Reporte de Cuentas Afectadas",

noImpactTitle: '¡Sin Impacto Financiero!',
noImpactMessage: 'No se encontraron cuentas afectadas. Se procederá con la **Eliminación Permanente de la cuenta (Hard Delete)**.',

impactDetectedTitle: '⚠️ Impacto Detectado: {count} Cuentas Afectadas',
impactDetectedMessage: 'La anulación ajustará automáticamente los saldos para mantener la consistencia financiera.',
tableOfAffectedAccountsDetails:'Detalles del impacto financiero en cuentas relacionadas',
affectedAccountColumn: 'Cuenta',
affectedAccountTypeColumn:'Tipo',
currentBalanceColumn: 'Saldo Actual',
netAdjustmentColumn: 'Ajuste Neto',
newBalanceColumn: 'Nuevo Saldo',
tableOfRelatedAccountsDetails: 'Cuentas con las que esta ha operado',
backButtonText: 'Volver',
backWithoutClosingLabel: 'Volver sin eliminar esta cuenta',
interactionsColumn: 'Movimientos',
netMovedColumn: 'Monto Neto Movido',
lastInteractionColumn: 'Último Movimiento',
totalNetAdjustment: 'Ajuste Neto Total:',
 unattributedAmount: 'No atribuible a ninguna cuenta:',
 unattributedNote:
  '{count} transacciones que una eliminación anterior ya revirtió. Se muestra junto al total, no se suma.',

 // Labels for the interactions cell.
 movement_expense: "Gasto",
 movement_income: "Ingreso",
 movement_investment: "Inversión",
 movement_debt: "Deuda",
 movement_pocket: "Bolsillo",
 movement_transfer: "Transferencia enviada",
 movement_receive: "Transferencia recibida",
 movement_account_opening: "Apertura de cuenta",
 movement_pnl: "Pérdidas y ganancias",
 movement_account_closure: "Eliminación de cuenta",
 movement_balance_reversal: "Reversión de saldo",

 income_source:'Ingreso',
 category_budget:"Gasto",
 debtor:"Préstamo",
 investment:"Inversión",
 bank:"Banco",
 cash:"Efectivo",
 pocket_saving:"Bolsillo",

 autoCloseIn:"Cierre automático en ",

  postOperationSuccessTitle: "Eliminación RTA Completada Exitosamente",
  postOperationSuccessSubtitle: "La cuenta {targetAccountName} ha sido eliminada",
  postOperationErrorTitle: "Eliminación RTA Fallida",
  postOperationErrorSubtitle: "No se pudo eliminar la cuenta {targetAccountName}",
  operationIdLabel: "ID de Operación",
  deletedAccountLabel: "Cuenta Eliminada",
  operationTimeLabel: "Hora de Operación",
  adjustmentResultsTitle: "Resultados de Ajustes Financieros",
  affectedAccountsCount: "Cuentas Afectadas",
  resultsTableNote: "Las cuentas afectadas han sido ajustadas automáticamente para mantener la consistencia financiera.",
  defaultSuccessMessage: "La anulación RTA se ha completado exitosamente. Todas las cuentas afectadas han sido ajustadas.",
  nextStepsTitle: "Próximos Pasos",
  contactAdminInstruction: "Comuníquese con el administrador de la aplicación",
  provideErrorIdInstruction: "Proporcione los detalles del error para investigación",
  tryAgainLaterInstruction: "Intente nuevamente más tarde o use un método diferente",
  accountLabel: "Cuenta",
  errorTimeLabel: "Hora del Error",
  backToActionsButton: "Volver a Panel de Cuentas",

  otherMethodsSectionTitle: "Otros métodos de eliminación",
  otherMethodsSectionDescription: "¿Prefiere no ejecutar la anulación anterior? Desactive la cuenta en su lugar, o elimínela de forma permanente sin revertir su impacto en otras cuentas.",

  closeOnlyPageTitle: "Eliminar Cuenta",
  closeOnlyDetailsTitle: "Cuenta a Eliminar",
  closeOnlyBlockedNotice: "Esta cuenta todavía tiene saldo. Se recomienda llevarlo a cero primero: transfiéralo a otra cuenta y su patrimonio no cambia. De lo contrario, use Revertir Saldo y Eliminar, que quita ese monto de su patrimonio.",
  relatedAccountsSummary: "Cuentas relacionadas",
  relatedAccountsNote: "El saldo nuevo y el ajuste neto muestran lo que le haría a cada una de estas cuentas eliminar esta con ajuste. La eliminación no cambia ninguna de esas cifras.",
  relatedAccountsHeading: "Cuentas con las que esta ha movido dinero",
  relatedAccountsTitle: "Esta cuenta ha movido dinero con {count} cuentas",
  relatedAccountsLede: "Cuántos movimientos comparte esta cuenta con cada una de ellas, y cuándo fue el último. Eliminar no cambia ninguna de estas cuentas: los movimientos que comparten con ella conservan su nombre, porque la cuenta eliminada queda registrada antes de que se elimine su fila.",
  relatedAccountsLedeAdjustment: "Dos de las columnas son de la otra vía de esta pantalla, no de la eliminación. El saldo nuevo y el ajuste neto son lo que dejaría en cada una de estas cuentas eliminar esta CON AJUSTE. La eliminación no cambia ninguna de las dos.",
  relatedAccountsNoneTitle: "Sin movimientos compartidos",
  relatedAccountsNoneMessage: "Esta cuenta no ha movido dinero con ninguna otra cuenta.",
  closeAccountBudgetWarning: "Su presupuesto queda en cero desde este mes; los montos de los meses anteriores se conservan.",
  closeOnlySectionTitle: "Eliminar esta cuenta",
  closeOnlySectionDescription: "La eliminación de una cuenta no se puede deshacer. El historial de la cuenta sigue siendo legible.",
  closeAccountAction: "Eliminar",

  softDeactivateTriggerButton: "Desactivar Cuenta",
  softDeactivateTitle: "¿Desactivar esta cuenta?",
  softDeactivateDescription: "Esto desactiva la cuenta en lugar de eliminarla. Su saldo, transacciones e historial permanecen exactamente iguales, y puede reactivarse más adelante. Esta acción no requiere un reporte de impacto financiero.",
  softDeactivateConfirmButton: "Desactivar Cuenta",
  softDeactivateSuccessMessage: "{targetAccountName} ha sido desactivada.",

  closeAccountTriggerButton: "Eliminar Cuenta",
  closeAccountTitle: "\u00bfEliminar esta cuenta?",
  closeAccountDescription: "Eliminar quita la cuenta y conserva su historial: las transacciones siguen siendo legibles bajo el mismo nombre, que vuelve a quedar disponible. Esto no se puede deshacer: la cuenta no se desactiva, se elimina, y no hay forma de reabrirla.",
  closeAccountPocketNotice: "Se liberarán los compromisos de bolsillo por {amount} de {name} (#{id}).",
  closeAccountConfirmButton: "Eliminar Cuenta",
  closeAccountSuccessMessage: "{targetAccountName} ha sido eliminada. Su historial permanece en el registro bajo el mismo nombre.",
  closeAccountBalanceLabel: "Saldo con el que eliminar\u00eda:",
  closeAccountBlockedByBalance: "Esta cuenta todavía tiene {residual}. Transfiéralo primero, o revierta el saldo y elimine en un solo paso.",
  closeAccountReverseTriggerButton: "Revertir Saldo y Eliminar",
  closeAccountReverseTitle: "Revertir el Saldo y Eliminar",
  closeAccountReverseDescription: "FinTrack moverá todo el saldo a la cuenta de compensación y eliminará esta cuenta en una sola operación. Si una parte falla, no ocurre ninguna.",
  closeAccountReverseConfirmButton: "Revertir y Eliminar",
  closeNetWorthSectionLabel: "Lo que esto le hace a su patrimonio",
  closeNetWorthBeforeLabel: "Patrimonio ahora",
  closeNetWorthAfterLabel: "Después de eliminar esta cuenta",
  closeNetWorthUnchangedNote: "Esta cuenta no suma en el patrimonio, así que eliminarla no cambia esa cifra.",

  closedAccountsMenuItem: "Cuentas eliminadas",
  closedAccountsPageTitle: "Cuentas eliminadas",
  closedAccountsLede: "Todas las cuentas que usted ha eliminado, bajo el nombre que tenían. Eliminar quita la cuenta y conserva su registro, así que esta lista es lo que una cuenta eliminada deja: cuándo se eliminó, por qué y qué era.",
  closedAccountsSearchLabel: "Buscar",
  closedAccountsSearchPlaceholder: "Nombre, motivo o categoría",
  closedAccountsTypeLabel: "Tipo",
  closedAccountsTypeAll: "Todos los tipos",
  closedAccountsSortLabel: "Ordenar por",
  closedAccountsSortClosedAt: "Fecha de eliminación",
  closedAccountsSortName: "Nombre",
  closedAccountsSortType: "Tipo",
  closedAccountsSortCreatedAt: "Fecha de apertura",
  closedAccountsOrderToggle: "Invertir el orden",
  closedAccountsOrderAsc: "Más antiguas primero",
  closedAccountsOrderDesc: "Más recientes primero",
  closedAccountsOrderAscShort: "ASC",
  closedAccountsOrderDescShort: "DESC",
  closedAccountsColumnName: "Cuenta",
  closedAccountsColumnType: "Tipo",
  closedAccountsColumnClosedAt: "Eliminada",
  closedAccountsColumnReason: "Motivo",
  closedAccountsColumnOpened: "Abierta",
  closedAccountsColumnStartingAmount: "Monto inicial",
  closedAccountsColumnCategory: "Categoría",
  closedAccountsNameUnknown: "Nombre no registrado",
  closedAccountsTypeUnknown: "Tipo no registrado",
  closedAccountsTotal: "{total} cuentas eliminadas",
  closedAccountsPageStatus: "Página {page} de {pageCount}",
  closedAccountsPreviousPage: "Página anterior",
  closedAccountsNextPage: "Página siguiente",
  closedAccountsPerPage: "Por página",
  closedAccountsEmptyTitle: "Todavía no ha eliminado nada",
  closedAccountsEmptyMessage: "Cuando usted elimine una cuenta, su registro aparece aquí y sigue siendo legible bajo el nombre que tenía.",
  closedAccountsNoMatchTitle: "Ninguna cuenta eliminada coincide",
  closedAccountsNoMatchMessage: "Nada de aquí coincide con la búsqueda y el filtro que usted fijó. Al limpiarlos vuelve la lista completa.",
  closedAccountsClearFilters: "Limpiar búsqueda y filtros",
  closedAccountsErrorMessage: "No se pudo leer la lista de cuentas eliminadas.",
  closedAccountsRetry: "Reintentar",
  closedAccountsBackButton: "Volver al panel de contabilidad",

  closeAccountReversalNotice: "Se moverán {residual} a la cuenta de compensación. El movimiento queda registrado.",
  closeReversalBoundaryStatement: "La cuenta de compensación la mantiene el sistema y no es una de sus cuentas, por eso queda fuera de su patrimonio. Si aparece en la lista de abajo, esa fila es historial anterior, no esta reversión.",
  closeAccountPreviewError: "No se pudo leer el saldo, as\u00ed que la eliminaci\u00f3n a\u00fan no puede ofrecerse.",
  closeAccountReasonLabel: "Motivo de la eliminación (obligatorio)",
  closeAccountReasonPlaceholder: "p. ej. Cuenta bancaria cerrada en la sucursal",
  closeAccountReasonHint: "Se guarda en Cuentas eliminadas.",

  hardDeleteTriggerButton: "Eliminar Sin Reversión",
  hardDeleteTitle: "¿Eliminar esta cuenta sin revertir su impacto?",
  hardDeleteDescription: "Esto elimina permanentemente la cuenta y sus propias transacciones. No se puede deshacer.",
  hardDeleteWarning: "El saldo histórico de cada contraparte que transaccionó con esta cuenta queda exactamente igual: no se corrige nada. Esto es distinto de la Anulación Retrospectiva Total de arriba, que revierte ese impacto antes de eliminar. Elija esta opción solo cuando explícitamente no quiera esa corrección.",
  hardDeleteConfirmButton: "Eliminar Sin Reversión",
  hardDeleteSuccessMessage: "{targetAccountName} ha sido eliminada permanentemente.",

 }
};






