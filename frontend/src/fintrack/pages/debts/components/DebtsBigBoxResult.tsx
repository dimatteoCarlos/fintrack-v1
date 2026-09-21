import { CURRENCY_OPTIONS, DEFAULT_CURRENCY } from '../../../helpers/constants';
import { currencyFormat } from '../../../helpers/functions';
import { CurrencyType } from '../../../types/types';

// A figure the answer did not carry; never 0, since on this board a zero is a real balance or count.
const DASH = '—';

type BigBoxResultPropType = {
  // Nullable per field, as the endpoint declares; an omitted field renders as a dash, not $0.00.
  bigScreenInfo: { title: string; amount: number | null }[];
  currency: CurrencyType | undefined;
};

export function DebtsBigBoxResult({
  bigScreenInfo,
  currency,
}: BigBoxResultPropType) {
  const defaultCurrency = currency ?? DEFAULT_CURRENCY;
  const formatNumberCountry = CURRENCY_OPTIONS[defaultCurrency];

  const formatAmount = (amount: number | null) =>
    amount === null
      ? DASH
      : currencyFormat(defaultCurrency, amount, formatNumberCountry);

  const totalTitle = bigScreenInfo[0].title;
  const totalAmount = bigScreenInfo[0].amount;

  const receivable = bigScreenInfo[1].title;
  const receivableAmount = bigScreenInfo[1].amount;

  const debtors = bigScreenInfo[2].title;
  const debtorCount = bigScreenInfo[2].amount;

  const payable = bigScreenInfo[3].title;

  // Magnitude only: the server serves payable negative (the accounting truth) and the label already
  // carries the direction in words, so the sign is dropped for display and never in the data.
  const payableAmount =
    bigScreenInfo[3].amount === null ? null : Math.abs(bigScreenInfo[3].amount);

  const lenders = bigScreenInfo[4].title;
  const creditorCount = bigScreenInfo[4].amount;

  return (
    <div className='bigBox__container flex-col-sb'>
      <div className='bigBox__mainInfo'>{totalTitle.toUpperCase()}</div>

      <div className='displayScreen dark flex-row-sb'>
        {/* "Net total", not "total": this is owed-to-owner minus owed-by-owner, not the sum of the two
            figures below. */}
        <div className='displayScreen--concept light'>{'net total'}</div>
        <div className='displayScreen--result light'>
          {formatAmount(totalAmount)}
        </div>
      </div>

      <div className='debtIndicatorContainer '>
        <div className='debtInfo '>
          <div className='displayScreen--concept light'>{receivable}:</div>
          {/* Unsigned and coloured: the label carries the direction, so colour is the second carrier.
              The counts take no colour, since they are not amounts. */}
          <div className='displayScreen--result light debtsBoard__amount--owed'>
            {formatAmount(receivableAmount)}
          </div>

          <div className='displayScreen--concept light'>{debtors}:</div>
          <div className='displayScreen--result light'>
            {debtorCount ?? DASH}
          </div>
        </div>
        {}

        <div className='debtInfo '>
          <div className='displayScreen--concept light'>{payable}:</div>

          <div className='displayScreen--result light debtsBoard__amount--owing'>
            {formatAmount(payableAmount)}
          </div>

          <div className='displayScreen--concept light'>{lenders}:</div>
          <div className='displayScreen--result light'>
            {creditorCount ?? DASH}
          </div>
        </div>
      </div>
    </div>
  );
}

export default DebtsBigBoxResult;
