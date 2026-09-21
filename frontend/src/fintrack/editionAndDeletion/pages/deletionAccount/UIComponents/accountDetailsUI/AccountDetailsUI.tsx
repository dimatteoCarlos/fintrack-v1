import { CurrencyType } from '../../../../../types/types';
import { DictionaryDataType } from '../../../../utils/languages';
import { getAccountTypeIcon } from '../../../../utils/accountTypeIcons.ts';
import { currencyMinorUnit } from '../../../../../helpers/functions.ts';
import './accountDetailsUI.css';

type AccountDetailsUIPropsType = {
  accountId: string | number;
  accountName: string;
  accountType: string;
  accountBalance: number;
  accountCurrency: CurrencyType;
  t: (keyText: keyof DictionaryDataType) => string;
  showStatusIndicator?: boolean;
  // Which action the card announces; defaults to the RTA annulment wording so existing
  // callers read as before.
  actionKey?: keyof DictionaryDataType;
  // Heading key, overridable so a screen that closes instead of deleting does not
  // announce a deletion.
  titleKey?: keyof DictionaryDataType;
};
export const AccountDetailsUI = ({
  accountId,
  accountName,
  accountType,
  accountBalance,
  accountCurrency,
  showStatusIndicator,
  actionKey = 'rtaDeletionAction',
  titleKey = 'accountDetailsTitle',
  t,
}: AccountDetailsUIPropsType) => {
  // The same mark the closed-account list and the dashboard give this type.
  const TypeIcon = getAccountTypeIcon(accountType);

  return (
    <div
      className='account-details'
      role='region,'
      aria-labelledby='account-details-title'
    >
      <h2 id='account-details-title' className='account-details-title'>
        {t(titleKey)}
      </h2>

      <p className='account-detail'>
        <strong>{t('accountIdLabel')}</strong>
        <span className='account-id' aria-label={`Account ID: accountId`}>
          {accountId}
        </span>
      </p>

      <p className='account-detail'>
        <strong>{t('accountNameLabel')}</strong>
        <span
          className='account-name'
          aria-label={`Account Name: ${accountName}`}
        >
          {accountName}
        </span>
      </p>

      <p className='account-detail'>
        <strong aria-label={`Account Type: ${accountType}`}>
          {t('accountTypeLabel')}
        </strong>
        <TypeIcon className='account-detail__type-icon' aria-hidden='true' />
        {t(`${accountType as keyof DictionaryDataType}`)}
      </p>
      <p className='account-detail'>
        <strong
          aria-label={`Account Balance: ${accountBalance} ${accountCurrency}`}
        >
          {t('accountBalanceLabel')}
        </strong>
        {/* The currency's own decimals: a yen balance has none. */}
        {`${accountBalance.toFixed(currencyMinorUnit(accountCurrency))} ${accountCurrency}`}
      </p>

      <p className='account-detail'>
        <strong>{t('actionLabel')}</strong>
        <span
          className='account-action'
          aria-label={`Action: ${t(actionKey)}`}
        >
          {t(actionKey)}
        </span>
      </p>

      {showStatusIndicator && (
        <div className='account-status' role='status' aria-live='polite'>
          {t('pendingDeletionStatus')}
        </div>
      )}
    </div>
  );
};

export default AccountDetailsUI;
