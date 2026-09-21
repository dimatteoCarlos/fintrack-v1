import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';

import LeftArrowLightSvg from '../../../../assets/LeftArrowSvg.svg';

import TopWhiteSpace from '../../../general_components/topWhiteSpace/TopWhiteSpace.tsx';
import { CardTitle } from '../../../general_components/CardTitle.tsx';
import MainNavbar from '../../../general_components/mainNavbar/MainNavbar.tsx';
import SummaryDetailBox from '../accountDetailSharedComponents/summaryDetailBox/SummaryDetailBox.tsx';
import ListAccountOfCategory from './ListAccountOfCategory.tsx';
import CoinSpinner from '../../../loader/coin/CoinSpinner.tsx';
import BudgetEditModal from '../../budget/components/budgetEditModal/BudgetEditModal.tsx';

import {
  capitalize,
  formatBudgetMonthLabel,
  withMonthParam,
} from '../../../helpers/functions.ts';
import { DEFAULT_CURRENCY } from '../../../helpers/constants.ts';
import { normalizeBudgetError } from '../../../helpers/normalizeBudgetError.ts';

import { setCurrentBudget } from '../../../api/budgetApi.ts';
import {
  BudgetErrorResponse,
  BudgetWriteRequest,
} from '../../../types/budgetTypes.ts';

import { useBudgetStatusStore } from '../../../stores/useBudgetStatusStore.ts';
import { useCurrencyStore } from '../../../stores/useCurrencyStore.ts';

import '../styles/forms-styles.css';
import '../../../general_components/monthPicker/styles/monthPicker-styles.css';
import './styles/categoryDetail-styles.css';

function CategoryAccountList() {
  const location = useLocation();
  const { categoryName } = useParams();

  // Only the return path travels in location.state; the figures come from the
  // budget store, so a reload straight into this screen still renders.
  const state = location.state ?? {};
  const { previousRoute: previousRouteFromState } = state as {
    previousRoute?: string;
  };

  // No request of its own: the module's single call is issued at level 1 and
  // this reads two slices of that one answer.
  const accounts = useBudgetStatusStore((state) => state.accounts);
  const categories = useBudgetStatusStore((state) => state.categories);
  const referenceMonth = useBudgetStatusStore((state) => state.referenceMonth);
  const currentMonth = useBudgetStatusStore((state) => state.currentMonth);
  const isLoading = useBudgetStatusStore((state) => state.isLoading);
  const error = useBudgetStatusStore((state) => state.error);
  const fetchStatus = useBudgetStatusStore((state) => state.fetchStatus);
  const refreshStatus = useBudgetStatusStore((state) => state.refreshStatus);

  // The month is read from this screen's own URL, not inherited: this route is
  // declared beside the budget layout, so nothing of level 1 is still mounted.
  const [searchParams] = useSearchParams();
  const month = searchParams.get('month');

  // Origin route, carried in the address (not history state) so it survives the return from a child.
  // Overview writes it (levelThreeLink.ts); the budget board omits it. Only an in-app path is accepted:
  // a Link renders an anchor, so an absolute URL would leave the site.
  const fromParam = searchParams.get('from');
  const originRoute =
    fromParam !== null && fromParam.startsWith('/fintrack/') ? fromParam : null;

  const budgetPageAddress =
    originRoute ?? previousRouteFromState ?? `/fintrack/budget`;

  // What a child hands back from its own back arrow: this screen's address,
  // `from` included, so the way out of Overview is still known one level down.
  // No month: the child appends it itself (CategoryDetailReading.tsx).
  const ownRoute =
    originRoute === null
      ? location.pathname
      : `${location.pathname}?from=${encodeURIComponent(originRoute)}`;

  // Level 1 normally fills the store before this screen mounts. A reload or a
  // bookmark landing here does not, so the call is issued from here too: the
  // store's guard turns it into a no-op when the month is already loaded.
  useEffect(() => {
    fetchStatus(month ?? undefined);
  }, [fetchStatus, month]);

  // CurrencyInitializer is mounted inside <Layout /> and this route is declared
  // beside it, so on a reload straight into this screen nothing has asked for the
  // rates when the editor opens and its conversion preview resolves to null.
  const rates = useCurrencyStore((state) => state.rates);
  const fetchRates = useCurrencyStore((state) => state.fetchRates);

  useEffect(() => {
    if (Object.keys(rates).length === 0) fetchRates();
  }, [rates, fetchRates]);

  const categoryAccounts = useMemo(
    () => accounts.filter((account) => account.categoryName === categoryName),
    [accounts, categoryName],
  );

  // An id and not a boolean: this screen lists several accounts, so the flag
  // has to name which row was pressed.
  const [editingAccountId, setEditingAccountId] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  // The whole envelope, not a sentence: the modal puts each issue beside the
  // field it names, and a 400's own message is the constant 'Validation Error'.
  const [saveError, setSaveError] = useState<BudgetErrorResponse | null>(null);

  // Read back out of the payload rather than copied into state when the modal
  // opens: after a save the rows are refetched, and a copy would keep showing
  // the figures the write replaced.
  const editingAccount =
    categoryAccounts.find(
      (account) => account.accountId === editingAccountId,
    ) ?? null;

  // 'YYYY-MM-01' text on both sides, so >= compares them correctly; no new Date(),
  // which parses as UTC midnight and shows the previous month west of Greenwich.
  // The server accepts writing a past month; this is what refuses to offer it.
  const canEdit =
    referenceMonth !== null &&
    currentMonth !== null &&
    referenceMonth >= currentMonth;

  const closeEditor = () => {
    setEditingAccountId(null);
    setSaveError(null);
  };

  // Does NOT close the modal on success: the modal is what decides whether
  // there is a confirmation to render, and closing here makes that unreachable.
  const handleSaveBudget = async ({
    amount,
    currency,
    month,
    appliesUntil,
  }: BudgetWriteRequest) => {
    if (!editingAccount) return null;

    setIsSaving(true);
    setSaveError(null);

    try {
      const response = await setCurrentBudget(editingAccount.accountId, {
        amount,
        currency,
        month,
        appliesUntil,
      });

      await refreshStatus();

      return response;
    } catch (err: unknown) {
      setSaveError(normalizeBudgetError(err));
      return null;
    } finally {
      setIsSaving(false);
    }
  };

  // The server's own fold of the rows listed below, not a sum over them: a
  // header and the rows under it cannot disagree if only one is computed.
  const categorySummary = useMemo(
    () =>
      categories.find((category) => category.categoryName === categoryName) ??
      null,
    [categories, categoryName],
  );

  // Figures are nullable only for accounts in mixed currencies, which V1 does not allow; the box is
  // withheld rather than showing a zero if the model ever widens.
  const summaryData =
    categorySummary &&
    categorySummary.budgetAmount !== null &&
    categorySummary.actualSpent !== null &&
    categorySummary.remainingBudget !== null
      ? {
          title: 'Budget',
          amount: categorySummary.budgetAmount,
          subtitle1: 'Spent',
          amount1: categorySummary.actualSpent,
          status: categorySummary.isOverBudget ?? false,
          amount2: categorySummary.remainingBudget,
          currency_code: categorySummary.currency ?? DEFAULT_CURRENCY,
          executionPercentage: categorySummary.executionPercentage,
        }
      : null;
  return (
    <>
      {/* budgetCategoryBoard is the frame's styling hook. Level 3 does not use it:
          it is a long form, and a form that cannot scroll as a document leaves
          fields under the fold. */}
      {/* The shell Layout gives every other screen: this route is declared beside
          Layout, not under it, so it must render .home__layout and the navbar
          itself. */}
      <div className='budgetCategoryShell'>
        <section className='page__container page__container--budget budgetCategoryBoard'>
          <TopWhiteSpace variant={'dark'} />

          {/* The column that puts this screen's rows at the same x as level 1's.
              The spacer above stays outside it. */}
          <div className='budgetDetail__content'>
            <div className='page__content'>
              <div className='main__title--container'>
                <Link
                  to={withMonthParam(budgetPageAddress, month)}
                  relative='path'
                  className='backArrow backArrow--dark'
                >
                  <LeftArrowLightSvg />
                </Link>

                <div className='form__title form__title--recordName'>
                  {capitalize(categoryName!)}
                </div>

              </div>
            </div>

            {/* Read-only, and no chevron: the scope is set where the whole board is
                visible, which is level 1. The label is the resolved month, so it
                stays a skeleton until the answer lands. */}
            {referenceMonth ? (
              <div className='month-badge month-badge--dark'>
                {formatBudgetMonthLabel(referenceMonth)}
              </div>
            ) : (
              <div
                className='month-badge month-badge--dark month-badge--skeleton'
                aria-hidden='true'
              />
            )}

            {summaryData && <SummaryDetailBox bubleInfo={summaryData} />}

            {/* A column header, not a title: the category name is stated above and
                the left column holds the subcategory. Four labels for the four
                cells of a row, as level 1 has over the same two lines. */}
            <CardTitle
              legend='Spent / Budget'
              subtitle='Remaining over / left'
              subLegend='% of spent budget'
            >
              {'Subcategory'}
            </CardTitle>

            {/* Loading, error and empty are three states, not one fallback: a
                category still on the wire is not a category without accounts. */}
            {isLoading && <CoinSpinner />}

            {!isLoading && error && (
              <p className='box__subtitle box__subtitle--message'>
                Error loading data: {error}
              </p>
            )}

            {!isLoading && !error && categoryAccounts.length === 0 && (
              <p className='box__subtitle box__subtitle--message'>
                This category has no budget accounts this month.
              </p>
            )}

            {!isLoading && !error && categoryAccounts.length > 0 && (
              <ListAccountOfCategory
                previousRoute={ownRoute}
                accounts={categoryAccounts}
                onEditAccount={setEditingAccountId}
                canEdit={canEdit}
              />
            )}
          </div>
        </section>
        <MainNavbar />
      </div>

      {/* Mounted outside <section>: the board is a frame with its own scroll,
          and a panel inside it would scroll with the list instead of over it. */}
      {editingAccount && (
        <BudgetEditModal
          accountName={editingAccount.subcategory ?? editingAccount.accountName}
          nature={editingAccount.nature}
          month={referenceMonth ?? ''}
          currency={editingAccount.currency}
          currentAmount={editingAccount.budgetAmount}
          nextMonthBudget={editingAccount.nextMonthBudget}
          actualSpent={editingAccount.actualSpent}
          remainingBudget={editingAccount.remainingBudget}
          executionPercentage={editingAccount.executionPercentage}
          isOverBudget={editingAccount.isOverBudget}
          isSaving={isSaving}
          error={saveError}
          onClose={closeEditor}
          onSave={handleSaveBudget}
        />
      )}
    </>
  );
}

export default CategoryAccountList;
