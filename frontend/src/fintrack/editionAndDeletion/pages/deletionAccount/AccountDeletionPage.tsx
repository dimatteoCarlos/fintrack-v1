import './accountDeletionPage.css';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Link,
  Navigate,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom';

import {
  defaultLanguage,
  isLanguageTypeValid,
  LanguageKeyType,
  languages,
} from '../../utils/languages.ts';
import { ModalStatusType } from '../../types/deletionTypes.ts';
import { AccountListType } from '../../../types/responseApiTypes.ts';

import { useLanguageTranslation } from '../../hooks/useLangTranslation.ts';
import { useRTAImpactAndDeletion } from '../../hooks/useRTAImpactAndDeletion.ts';
import { useCloseAccount } from '../../hooks/useCloseAccount.ts';

import LeftArrowDarkSvg from '../../../../assets/LeftArrowDarkSvg.svg';

import LoadingReportUI from './UIComponents/loadingReportUI/LoadingReportUI.tsx';
import ImpactReportUI from './UIComponents/impactReportUI/ImpactReportUI.tsx';
import { NoImpactReportUI } from './UIComponents/impactReportUI/NoImpactReportUI.tsx';
import AccountDetailsUI from './UIComponents/accountDetailsUI/AccountDetailsUI.tsx';
import { RTAConfirmationModal } from './UIComponents/confirmationModalUI/RTAConfirmationModal.tsx';
import ReportErrorUI from './UIComponents/reportErrorUI/ReportErrorUI.tsx';
import ProceedButtonUI from './UIComponents/proceedButtonUI/ProceedButtonUI.tsx';
import PostOperationView from './UIComponents/postOperationView/PostOperationView.tsx';
import { SoftDeactivateAccountUI } from './UIComponents/softDeletionUI/SoftDeactivateAccountUI.tsx';
import { HardDeleteConfirmationUI } from './UIComponents/hardDeletionUI/HardDeleteConfirmationUI.tsx';
import { CloseAccountUI } from './UIComponents/closeAccountUI/CloseAccountUI.tsx';
import { CLOSE_IS_THE_ONLY_METHOD } from '../../config/deletionMethodPolicy.ts';
// Where a reader with no navigation state belongs; shared by the guard and the back
// navigation so they cannot disagree.
const ACCOUNTING_DASHBOARD_ROUTE = '/fintrack/tracker/accounting';

type AccountDeletionViewPropType = {
  accountData: AccountListType;
  previousRoute: string;
};

const AccountDeletionView = ({
  accountData,
  previousRoute,
}: AccountDeletionViewPropType) => {
  const navigateTo = useNavigate();
  const { accountId } = useParams();

  const targetAccountType = accountData.account_type_name;
  const targetAccountName = accountData.account_name;
  const targetAccountId = Number(accountId) || Number(accountData.account_id);
  const targetAccountBalance = accountData.account_balance;
  const targetAccountCurrency = accountData.currency_code;
  const [language, setLanguage] = useState<LanguageKeyType>(defaultLanguage);

  useEffect(() => {
    const savedLang = localStorage.getItem('userLang') as LanguageKeyType;

    if (isLanguageTypeValid(savedLang)) {
      setLanguage(savedLang);
    } else {
      console.log(`user saved language ${savedLang} is not valid`);
      setLanguage(defaultLanguage);
      localStorage.setItem('userLang', defaultLanguage);
    }
  }, [setLanguage]);
  const changeLanguage = (lang: typeof language) => {
    if (languages[lang]) {
      setLanguage(lang);
      localStorage.setItem('userLang', lang);
    }
  };

  const { translateText } = useLanguageTranslation(language);

  const [isModalOpen, setIsModalOpen] = useState(false);
  // Independent of the RTA modal: SOFT and HARD neither read the RTA impact report nor
  // share its open state.
  const [isSoftModalOpen, setIsSoftModalOpen] = useState(false);
  const [isHardModalOpen, setIsHardModalOpen] = useState(false);
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);
  // Whether the account-relations section is expanded. It also gates the report fetch:
  // the section is closed on arrival, so an owner who never opens it never pays for it.
  const [isRelationsOpen, setIsRelationsOpen] = useState(false);
  // CLOSE refuses an account that still holds a balance. Read from the close preview (the figure the
  // engine refuses on), not the stored balance. A loading or failed preview keeps the annulment
  // hidden: no answer is not evidence of a balance.
  const close = useCloseAccount(targetAccountId);

  const isBalanceBlockingTheClose =
    !close.isLoadingPreview &&
    !close.previewError &&
    close.residual !== null &&
    !close.canClose;

  // Reversal route switched off: CLOSE settles nothing, so a blocking balance is resolved outside it.
  // To re-enable, restore `!CLOSE_IS_THE_ONLY_METHOD || isBalanceBlockingTheClose`; ProceedButtonUI
  // and ImpactReportUI stay for the planned "reverse the balance and close".
  const isAnnulmentOffered: boolean = false;

  const {
    affectedAccountReport,
    relatedAccounts,
    totalNetAdjustmentAmount,
    unattributedAmount,
    unattributedTransactionCount,
    pocketImpact,
    isLoadingReport,
    reportError,

    executeRTAAnnulment,

    isExecutingDeletion,
    deletionResult,
    fetchLoadError,
    resetDeletionState,
  } = useRTAImpactAndDeletion(
    targetAccountId,
    targetAccountName,
    isRelationsOpen,
  );

  // Post-operation state comes only from the RTA annulment: the close reports through its
  // own hook and navigates away. Gated so a failed impact request cannot replace the close
  // screen with an error view for an operation the owner never started.
  const isPostOperation = isAnnulmentOffered && (deletionResult || fetchLoadError);

  const { mainStatusFromParent, modalMessage } = useMemo(() => {
    let modalStatus: ModalStatusType = 'idle';
    let message = translateText('clickToConfirm');
    let finalSuccess = '';

    // Priority: executing, then error, then success.
    if (isExecutingDeletion) {
      modalStatus = 'executing';
      message = translateText('processing');
    }
    else if (fetchLoadError) {
      modalStatus = 'error';
      message = fetchLoadError;
      console.log({ fetchLoadError });
    }
    else if (deletionResult) {
      modalStatus = 'success';
      message = deletionResult.message;
      finalSuccess = deletionResult.message;
    }

    return {
      mainStatusFromParent: modalStatus,
      modalMessage: message,
      finalSuccessMessage: finalSuccess,
    };
  }, [
    deletionResult,
    fetchLoadError,
    isExecutingDeletion,
    translateText,
  ]);

  const handleModalConfirm = useCallback(() => {
    executeRTAAnnulment();
  }, [executeRTAAnnulment]);

  const handleModalClose = () => {
    setIsModalOpen(false);
  };
  const handleBackToAccountingDashboard = useCallback(() => {
    console.log('🔙 Navigating back to actions with reset');
    if (resetDeletionState) {
      resetDeletionState();
    }

    setIsModalOpen(false);

    navigateTo(previousRoute);
  }, [resetDeletionState, previousRoute, navigateTo]);

  const renderReportContent = () => {
    const rowsOnScreenCount = isAnnulmentOffered
      ? affectedAccountReport.length
      : relatedAccounts.length;

    if (isLoadingReport) {
      return <LoadingReportUI language={language} />;
    }

    if (reportError) {
      return <ReportErrorUI errorMessage={reportError} t={translateText} />;
    }
    // Judged on the array this mode renders: both come from one server CTE, but only the
    // displayed one can be empty on screen.
    if (rowsOnScreenCount === 0) {
      return (
        <NoImpactReportUI
          isProjectionShown={isAnnulmentOffered}
          t={translateText}
        />
      );
    }

    return (
      <ImpactReportUI
        report={affectedAccountReport}
        relatedAccounts={relatedAccounts}
        totalNetAdjustmentAmount={totalNetAdjustmentAmount}
        unattributedAmount={unattributedAmount}
        unattributedTransactionCount={unattributedTransactionCount}
        isProjectionShown={isAnnulmentOffered}
        targetAccountCurrency={targetAccountCurrency}
        t={translateText}
      />
    );
  };

  const getReportTitle = () => {
    // The annulment titles announce an impact, which is right only while the annulment is
    // on offer; under CLOSE the section is plain information about the account.
    if (!isAnnulmentOffered) {
      return translateText('relatedAccountsHeading');
    }
    if (affectedAccountReport.length === 0) {
      return translateText('reportTitleNoImpact');
    }
    return translateText('reportTitleWithImpact');
  };

  return (
    <div className='account-deletion-page'>
      <header className='page-header '>
        {/* The only way off this page that closes nothing. The label is visible as well as
            announced, so an owner just told the account cannot be reopened does not have to
            find an unlabelled arrow. */}
        <Link
          to={previousRoute}
          className='header-back-button'
          aria-label={translateText('backWithoutClosingLabel')}
        >
          <LeftArrowDarkSvg aria-hidden='true' />
          <span className='header-back-button__text'>
            {translateText('backButtonText')}
          </span>
        </Link>

        <h1 className='page-title'>
          {translateText(
            CLOSE_IS_THE_ONLY_METHOD ? 'closeOnlyPageTitle' : 'pageTitle',
          )}
        </h1>

        <div className='language-selector'>
          <select
            className='language-dropdown'
            aria-label={language === 'es' ? 'Español' : 'English'}
            name='language'
            id='language'
            onChange={(e) => changeLanguage(e.target.value as LanguageKeyType)}
            value={language}
          >
            <option value='es'>Español</option>
            <option value='en'>English</option>
          </select>
        </div>
      </header>

      {isPostOperation ? (
        <PostOperationView
          t={translateText}
          result={deletionResult ? 'success' : 'error'}
          data={deletionResult || fetchLoadError || ''}
          originalAccount={{
            targetAccountId,
            targetAccountName,
            targetAccountType,
            targetAccountBalance,
            targetAccountCurrency,
          }}
          affectedAccounts={affectedAccountReport}
          onBackToActions={handleBackToAccountingDashboard}
        />
      ) : (
        <>
          <AccountDetailsUI
            accountId={targetAccountId}
            accountName={targetAccountName}
            accountType={targetAccountType}
            accountBalance={targetAccountBalance}
            accountCurrency={targetAccountCurrency}
            actionKey={
              CLOSE_IS_THE_ONLY_METHOD ? 'closeAccountAction' : 'rtaDeletionAction'
            }
            titleKey={
              CLOSE_IS_THE_ONLY_METHOD
                ? 'closeOnlyDetailsTitle'
                : 'accountDetailsTitle'
            }
            t={translateText}
          />

          {/* Related accounts, read before choosing a method; the report fetch is gated on it opening.
              The columns belong to the annulment: new balance and net adjustment project its effect. */}
          <details
            className='account-relations'
            onToggle={(event) =>
              setIsRelationsOpen(event.currentTarget.open)
            }
          >
            <summary className='account-relations__summary'>
              {translateText('relatedAccountsSummary')}
            </summary>

            <div className='account-relations__body'>
              {isAnnulmentOffered && (
                <p className='account-relations__note'>
                  {translateText('relatedAccountsNote')}
                </p>
              )}

              <h3 className='content-title'>{getReportTitle()}</h3>

              {renderReportContent()}

            </div>
          </details>

          {/* One method today (CLOSE, via deletionMethodPolicy.ts), three when that flag
              is off; none is described by the impact report. */}
          <section className='deletion-methods-section'>
            <h2 className='deletion-methods-title'>
              {translateText(
                CLOSE_IS_THE_ONLY_METHOD
                  ? 'closeOnlySectionTitle'
                  : 'otherMethodsSectionTitle',
              )}
            </h2>
            {/* Says why the only button will refuse, before it is pressed. */}
            {isBalanceBlockingTheClose && (
              <p className='deletion-methods-blocked' role='note'>
                {translateText('closeOnlyBlockedNotice')}
              </p>
            )}
            <p className='deletion-methods-description'>
              {translateText(
                CLOSE_IS_THE_ONLY_METHOD
                  ? 'closeOnlySectionDescription'
                  : 'otherMethodsSectionDescription',
              )}
            </p>

            {/* The other route, directly under the notice that explains why it is offered;
                shown only while the balance refuses the close. */}
            {isAnnulmentOffered && !isLoadingReport && !reportError && (
              <div className='action-section'>
                <ProceedButtonUI
                  onClick={() => setIsModalOpen(true)}
                  t={translateText}
                  disabled={isExecutingDeletion}
                  variant='secondary'
                />
              </div>
            )}

            <div className='deletion-methods-actions'>
              {!CLOSE_IS_THE_ONLY_METHOD && (
                <button
                  type='button'
                  className='deletion-method-button deletion-method-button--soft'
                  onClick={() => setIsSoftModalOpen(true)}
                  aria-label={translateText('softDeactivateTriggerButton')}
                >
                  {translateText('softDeactivateTriggerButton')}
                </button>
              )}
              {/* One button, label picked by the balance: when it blocks the close, it carries the
                  operation that resolves it; a second button would offer one guaranteed to fail. */}
              <button
                type='button'
                className={`deletion-method-button deletion-method-button--close${
                  CLOSE_IS_THE_ONLY_METHOD
                    ? ' deletion-method-button--only'
                    : ''
                }`}
                onClick={() => setIsCloseModalOpen(true)}
                aria-label={translateText(
                  isBalanceBlockingTheClose
                    ? 'closeAccountReverseTriggerButton'
                    : 'closeAccountTriggerButton',
                )}
              >
                {translateText(
                  isBalanceBlockingTheClose
                    ? 'closeAccountReverseTriggerButton'
                    : 'closeAccountTriggerButton',
                )}
              </button>
              {!CLOSE_IS_THE_ONLY_METHOD && (
                <button
                  type='button'
                  className='deletion-method-button deletion-method-button--hard'
                  onClick={() => setIsHardModalOpen(true)}
                  aria-label={translateText('hardDeleteTriggerButton')}
                >
                  {translateText('hardDeleteTriggerButton')}
                </button>
              )}
            </div>
          </section>

        </>
      )}

      <RTAConfirmationModal
        t={translateText}
        isOpen={isModalOpen}
        onClose={handleModalClose}
        onConfirm={handleModalConfirm}
        mainStatusFromParent={mainStatusFromParent}
        message={modalMessage}
        affectedAccountsReportCount={affectedAccountReport.length}
        pocketImpact={pocketImpact}
      />

      <SoftDeactivateAccountUI
        t={translateText}
        isOpen={isSoftModalOpen}
        targetAccountId={targetAccountId}
        targetAccountName={targetAccountName}
        onClose={() => setIsSoftModalOpen(false)}
        onDeactivated={handleBackToAccountingDashboard}
      />

      {/* CLOSE sits between SOFT and HARD in cost: reversible deactivation, closure that
          keeps the history, erasure that keeps none. The dialog confirms whichever
          operation the button named: both read isBalanceBlockingTheClose. */}
      <CloseAccountUI
        isBalanceReversed={isBalanceBlockingTheClose}
        t={translateText}
        isOpen={isCloseModalOpen}
        targetAccountId={targetAccountId}
        targetAccountName={targetAccountName}
        targetAccountType={targetAccountType}
        close={close}
        onClose={() => setIsCloseModalOpen(false)}
        onClosed={handleBackToAccountingDashboard}
      />

      {/* HARD: permanent, with no reversal of the impact on counterparties. */}
      <HardDeleteConfirmationUI
        t={translateText}
        isOpen={isHardModalOpen}
        targetAccountId={targetAccountId}
        targetAccountName={targetAccountName}
        onClose={() => setIsHardModalOpen(false)}
        onErased={handleBackToAccountingDashboard}
      />
    </div>
  );
};

// Entered only from an account's actions menu, which passes the account in location.state;
// a reload has none, so redirect instead of throwing on the destructure. A separate
// component and not an early return in the view: the view's hooks must not be skipped.
export const AccountDeletionPage = () => {
  const location = useLocation();
  const state = location.state as Partial<AccountDeletionViewPropType> | null;

  if (!state?.accountData) {
    return <Navigate to={ACCOUNTING_DASHBOARD_ROUTE} replace />;
  }

  return (
    <AccountDeletionView
      accountData={state.accountData}
      previousRoute={state.previousRoute ?? ACCOUNTING_DASHBOARD_ROUTE}
    />
  );
};

export default AccountDeletionPage
