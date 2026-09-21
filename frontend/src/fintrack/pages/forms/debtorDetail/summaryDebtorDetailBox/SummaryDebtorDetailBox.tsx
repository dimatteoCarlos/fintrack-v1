import {
  CURRENCY_OPTIONS,
  DEFAULT_CURRENCY,
} from '../../../../helpers/constants';
import { currencyFormat } from '../../../../helpers/functions';

import { DebtorListType } from '../../../../types/responseApiTypes';
import { StatusSquare } from '../../../../general_components/boxComponents/BoxComponents';

import './styles/summaryDebtorDetailBox-style.css';

const defaultCurrency = DEFAULT_CURRENCY;

// Placeholder for a figure the answer did not carry; never 0 or NaN, since a zero
// on this card means a settled debtor.
const DASH = '—';

type SummaryDetailPropType = {
  bubleInfo: DebtorListType;
};

function SummaryDebtorDetailBox({ bubleInfo }: SummaryDetailPropType) {
  const title = 'amount';
  const subtitle1 = '';
  const { creditor, total_debt_balance: amount, currency_code } = bubleInfo;
  const type = creditor ? 'Lender' : 'Debtor';

  // Direction of the position from the owner's side, beside the counterparty's role:
  // the role names the other party, the phrase says which way the money runs. It
  // reads the same flag as the status square, so the two cannot disagree.
  const directionPhrase = creditor
    ? `You owe to ${type}`
    : `You're owed by ${type}`;

  const currency = currency_code ?? defaultCurrency;
  // The locale is the reader's, not the amount's: taken from the amount's own
  // currency, Intl leaves every currency unmarked and the dollar and the Colombian
  // and Mexican pesos all narrow to '$'.
  const formatNumberCountry = CURRENCY_OPTIONS[defaultCurrency];

  // Coerced, not type-tested: the balance arrives as a STRING despite this type (node-postgres
  // serves DECIMAL as text), so a typeof 'number' check would reject every real figure.
  // Only an absent figure must be excluded, and Number reports it as NaN.
  const numericAmount =
    amount === null || amount === undefined ? NaN : Number(amount);

  // Unsigned: the line below states the direction in words, and a minus beside
  // "You owe" would say it twice and read as a negative debt. Movement rows do the
  // opposite because there the sign is the only carrier.
  const formattedAmount = Number.isNaN(numericAmount)
    ? DASH
    : currencyFormat(currency, Math.abs(numericAmount), formatNumberCountry);

  return (
    <>
      <div className='summaryDebtor__container'>
        <div className='summaryDebtor__title'>{title}</div>
        <div className='summaryDebtor__data'>
          <div className='summaryDebtor__data--amount'>
            {/* Coloured off the same flag as the phrase and the square, so they
                cannot disagree. Panel variants of the tokens: the pair for the
                app surface falls under the contrast floor on cream. */}
            <span
              className={`summaryDebtor__amount summaryDebtor__amount--${
                creditor ? 'owing' : 'owed'
              }`}
            >
              {formattedAmount}
            </span>
          </div>

          <div className='summaryDebtor__data--subtitle1'>{subtitle1}</div>

          <div className='summaryDebtor__data--status '>
            {/* Red when the owner owes, plain when owed to them; same flag as the
                phrase. */}
            <StatusSquare alert={type == 'Lender' ? 'alert' : ''} />
            <div className='summaryDebtor__data--subtitle2'>
              {directionPhrase}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default SummaryDebtorDetailBox;
