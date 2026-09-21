// The currency should come from global state rather than a constant.
import {
  DEFAULT_CURRENCY,
  DATE_TEXT_FORMAT,
} from '../../../../../helpers/constants.ts';
// Every amount below prints the decimals of its own currency, not a fixed 2.
import { currencyMinorUnit } from '../../../../../helpers/functions.ts';

import {
  ImpactReportRowType,
  MovementBreakdownEntryType,
  RelatedAccountRowType,
} from '../../../../types/deletionTypes.ts';

import { DictionaryDataType } from '../../../../utils/languages.ts';

import './impactReportUI.css';

type ImpactReportUIPropsType = {
  // Rows of the projection reading; used only while isProjectionShown is true.
  report?: ImpactReportRowType[];
  // Rows of the plain reading (isProjectionShown false). A separate array, not a
  // union row type: the projection row needs its four money columns required.
  relatedAccounts?: RelatedAccountRowType[];
  // Folded by the server. null (absent from the response) is not 0 and renders differently.
  totalNetAdjustmentAmount: number | null;
  unattributedAmount: number | null;
  unattributedTransactionCount: number | null;
  // Picks rows and columns. New balance, net adjustment, total and unattributed amount describe
  // ANNULLING, so CLOSE hides them and current balance too; shared-movement count and last date
  // show why the account is listed. Defaults to true.
  isProjectionShown?: boolean;
  // Currency of the net-moved column: the target's, not each row's, because the
  // figure is summed off the target's rows. Absent renders no code rather than a wrong one.
  targetAccountCurrency?: string;
  t: (key: keyof DictionaryDataType) => string;
};

// Formatted in the reader's zone, not UTC: MAX() of a TIMESTAMPTZ is an instant,
// and a movement at 21:00 in UTC-4 is already the next calendar day in UTC.
const formatInteractionDate = (isoInstant: string) => {
  const parsed = new Date(isoInstant);

  // A date that does not parse renders as a dash, never as "Invalid Date".
  if (Number.isNaN(parsed.getTime())) {
    return '—';
  }

  return parsed.toLocaleDateString(DATE_TEXT_FORMAT, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

// Catalog names carry hyphens ('account-opening') and the dictionary is a flat
// record, so hyphens become underscores. The prefix keeps these apart from
// account-type entries: 'investment' is both, and one entry would tie their labels.
const movementLabelKey = (movementTypeName: string) =>
  `movement_${movementTypeName.replace(/-/g, '_')}` as keyof DictionaryDataType;

// getLangText returns the key itself when the dictionary has no entry, so a
// catalog movement type missing here renders as its database name
// ('account-opening') rather than as 'movement_account_opening'.
const movementLabel = (
  t: (key: keyof DictionaryDataType) => string,
  movementTypeName: string,
) => {
  const key = movementLabelKey(movementTypeName);
  const translated = t(key);

  return translated === key ? movementTypeName : translated;
};

// A count of one shows only the movement name; the figure above already says it once.
const movementBreakdownText = (
  t: (key: keyof DictionaryDataType) => string,
  breakdown: MovementBreakdownEntryType[],
) =>
  breakdown
    .map((entry) =>
      entry.count === 1
        ? movementLabel(t, entry.movementTypeName)
        : `${entry.count} × ${movementLabel(t, entry.movementTypeName)}`,
    )
    .join(' · ');

const ImpactReportUI = ({
  report = [],
  relatedAccounts = [],
  totalNetAdjustmentAmount,
  unattributedAmount,
  unattributedTransactionCount,
  isProjectionShown = true,
  targetAccountCurrency,
  t,
}: ImpactReportUIPropsType) => {
  // Read, not summed here: a reduce over report would be short by
  // unattributedAmount, which no row carries (an earlier deletion already
  // reversed those transactions, so they name no live account).
  const hasTotal = totalNetAdjustmentAmount !== null;

  // Zero is the ordinary case and gets no line; a nonzero amount is why the
  // rows do not add up to the total.
  const showsUnattributed =
    isProjectionShown &&
    unattributedAmount !== null &&
    unattributedAmount !== 0;

  // Counts the array on screen: both come from one server CTE, but the title
  // must match the rows the reader can see.
  const displayedRowCount = isProjectionShown
    ? report.length
    : relatedAccounts.length;

  const formatImpactReportTitle = (title: string) =>
    title.replace('{count}', displayedRowCount.toString());

  const formatUnattributedNote = (note: string) =>
    note.replace('{count}', (unattributedTransactionCount ?? 0).toString());

  return (
    <div className='impact-report-container '>
      <div className='impact-report-warning impact-report-warning--informational'>
        {/* Same title in both modes: the rows are the accounts this one has
            transacted with, whichever method is picked. */}
        <p className='impact-warning-title '>
          {formatImpactReportTitle(t('relatedAccountsTitle'))}
        </p>
        {/* The lede differs by mode because the columns do. */}
        <p className='impact-warning-message'>
          {t(
            isProjectionShown
              ? 'relatedAccountsLedeAdjustment'
              : 'relatedAccountsLede',
          )}
        </p>
      </div>

      <div className='impact-report-table-wrapper'>
        <table
          className='impact-report-table'
          aria-label={t(
            isProjectionShown
              ? 'tableOfAffectedAccountsDetails'
              : 'tableOfRelatedAccountsDetails',
          )}
        >
          <thead>
            <tr>
              <th>{t('affectedAccountColumn')}</th>
              {isProjectionShown && <th>{t('currentBalanceColumn')}</th>}
              {isProjectionShown && <th>{t('newBalanceColumn')}</th>}
              {isProjectionShown && <th>{t('netAdjustmentColumn')}</th>}
              <th>{t('affectedAccountTypeColumn')}</th>
              {!isProjectionShown && <th>{t('interactionsColumn')}</th>}
              {!isProjectionShown && <th>{t('netMovedColumn')}</th>}
              {!isProjectionShown && <th>{t('lastInteractionColumn')}</th>}
            </tr>
          </thead>
          <tbody>
            {isProjectionShown
              ? report.map((row) => (
                  <tr key={row.affectedAccountId}>
                    <td className='account-name'>{row.affectedAccountName}</td>

                    <td className='current-balance'>
                      {row.affectedAccountCurrentBalance.toFixed(
                        currencyMinorUnit(row.affectedAccountCurrencyCode),
                      )}{' '}
                      {row.affectedAccountCurrencyCode}
                    </td>

                    <td className='new-balance'>
                      {(
                        row.affectedAccountCurrentBalance +
                        row.affectedAccountNetAdjustmentAmount
                      ).toFixed(
                        currencyMinorUnit(row.affectedAccountCurrencyCode),
                      )}{' '}
                      {row.affectedAccountCurrencyCode}
                    </td>

                    <td
                      className={`net-adjustment
        ${row.affectedAccountNetAdjustmentAmount >= 0 ? 'positive' : 'negative'}`}
                    >
                      {row.affectedAccountNetAdjustmentAmount.toFixed(
                        currencyMinorUnit(row.affectedAccountCurrencyCode),
                      )}{' '}
                      {row.affectedAccountCurrencyCode}
                    </td>

                    <td className='account-type'>
                      {t(
                        `${row.affectedAccountType as keyof DictionaryDataType}`,
                      )}
                    </td>
                  </tr>
                ))
              : relatedAccounts.map((row) => (
                  <tr key={row.accountId}>
                    <td className='account-name'>{row.accountName}</td>

                    <td className='account-type'>
                      {t(`${row.accountTypeName as keyof DictionaryDataType}`)}
                    </td>

                    {/* Breakdown in the cell, not a title attribute (invisible to touch and keyboard): it
                        explains why the compensation account is listed. Without the field: count only. */}
                    <td className='interaction-count'>
                      <span className='interaction-count__total'>
                        {row.interactionCount}
                      </span>

                      {row.movementBreakdown?.length ? (
                        <span className='interaction-count__movements'>
                          {movementBreakdownText(t, row.movementBreakdown)}
                        </span>
                      ) : null}
                    </td>

                    {/* Zero takes neither colour: it means equal movement both
                        ways, and green would read as a gain. */}
                    <td
                      className={`net-moved${
                        row.netAmount > 0
                          ? ' positive'
                          : row.netAmount < 0
                            ? ' negative'
                            : ''
                      }`}
                    >
                      {row.netAmount.toFixed(
                        currencyMinorUnit(targetAccountCurrency ?? DEFAULT_CURRENCY),
                      )}
                      {targetAccountCurrency ? ` ${targetAccountCurrency}` : ''}
                    </td>

                    <td className='last-interaction'>
                      {formatInteractionDate(row.lastInteractionDate)}
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      {/* Projection only: with the money columns hidden under CLOSE there is
          nothing to total, and it would read as a net-worth change. */}
      {isProjectionShown && (
      <p className='impact-report-total'>
        {t('totalNetAdjustment')}
        <span
          className={`total-amount ${
            hasTotal
              ? totalNetAdjustmentAmount > 0
                ? 'positive'
                : 'negative'
              : 'absent'
          }`}
        >
          {hasTotal
            ? `${totalNetAdjustmentAmount.toFixed(currencyMinorUnit(DEFAULT_CURRENCY))} ${DEFAULT_CURRENCY}`
            : '—'}
        </span>
      </p>
      )}

      {showsUnattributed && (
        <p className='impact-report-unattributed'>
          <span className='unattributed-label'>{t('unattributedAmount')}</span>
          <span className='unattributed-amount'>
            {unattributedAmount.toFixed(currencyMinorUnit(DEFAULT_CURRENCY))}{' '}
            {DEFAULT_CURRENCY}
          </span>
          <span className='unattributed-note'>
            {formatUnattributedNote(t('unattributedNote'))}
          </span>
        </p>
      )}
    </div>
  );
};

ImpactReportUI.propTypes = {};

export default ImpactReportUI;
