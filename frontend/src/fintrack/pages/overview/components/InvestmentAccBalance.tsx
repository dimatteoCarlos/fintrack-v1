import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { StatusSquare } from '../../../general_components/boxComponents/BoxComponents.tsx';
import { CardTitle } from '../../../general_components/CardTitle.tsx';
import { currencyFormat } from '../../../helpers/functions.ts';
import { AccountListType } from '../../../types/responseApiTypes.ts';
import PanelState from './PanelState.tsx';
import { PanelTotal } from '../../../general_components/panelTotal/PanelTotal.tsx';
import { useOverviewStore } from '../../../stores/useOverviewStore.ts';
import { monthLabel } from '../helpers/monthLabel.ts';

import {
  CURRENCY_OPTIONS,
  DEFAULT_CURRENCY,
} from '../../../helpers/constants.ts';

// Overview.tsx asks the route once for bank_and_investment and hands each card its
// own type, so this card and AccountBalance.tsx share one request.
type AccountPropType = {
  previousRoute: string;
  // null while nothing has arrived; an empty array means the owner holds no
  // investment account, which is a different state and renders as nothing.
  accounts: AccountListType[] | null;
  isLoading: boolean;
  error: string | null;
  // Asks the shared accounts request again. Overview.tsx owns the fetch, so the
  // retry the error state offers has to come down with the state it belongs to.
  onRetry: () => void;
};

const defaultCurrency = DEFAULT_CURRENCY;
const formatNumberCountry = CURRENCY_OPTIONS[defaultCurrency];
const subtitle = 'Capital Invested';
const concept = 'Factual Balance';

// An account that arrives without a starting amount has no denominator, so the
// result is unknown rather than zero.
const DASH = '—';

function InvestmentAccountBalance({
  previousRoute,
  accounts,
  isLoading,
  error,
  onRetry,
}: AccountPropType) {
  // The total is read, never summed (see AccountBalance.tsx): domainCards.investment.ledgerBalance
  // covers the same investment accounts this panel lists, at the close of the served month.
  const investment = useOverviewStore((state) => state.domainCards?.investment);
  const referenceMonth = useOverviewStore((state) => state.referenceMonth);
  const servedWindow = useOverviewStore((state) => state.window);

  const [investmentAccountsToRender, setInvestmentAccountsToRender] = useState<
    AccountListType[]
  >(
    [],
  );
  useEffect(() => {
    function updateInvestmentAccounts() {
      const newInvestmentAccounts: AccountListType[] =
        accounts && !isLoading && !error && !!accounts.length
          ? accounts.map((acc, indx) => ({
              account_id: acc.account_id ?? indx,
              account_name: acc.account_name,
              concept: { concept },
              account_balance: acc.account_balance,
              // Carried through: the server serves it as a float, and dropping it
              // made capital undefined, so every account reported 0 % profit.
              account_starting_amount: acc.account_starting_amount,
              account_type_name: acc.account_type_name,
              currency_code: acc.currency_code ?? defaultCurrency,
              account_start_date: acc.account_start_date ?? acc.created_at,
              account_type_id: acc.account_type_id,
            }))
          : [];
      setInvestmentAccountsToRender(newInvestmentAccounts);
    }
    updateInvestmentAccounts();
  }, [accounts, isLoading, error]);

 // Loading and error live in PanelState, which returns null when it has nothing
 // to say; returning null on error would give no message, no way back, and look
 // like an owner with no investment account.
  if (isLoading || error) {
    return (
      <PanelState
        title='Investment Accounts'
        subject='Your investment accounts'
        isLoading={isLoading}
        error={error}
        onRetry={onRetry}
      />
    );
  }

 // accounts is null until Overview's one request has answered. An owner with no
 // investment account is a real answer, not a failure, and renders nothing.
  if (!accounts || !investmentAccountsToRender.length) return null;

  // Same two clocks as the bank panel: the tiles hold today's balance and the
  // total holds the close of the served month, which are one figure for the
  // month in course and two questions for an earlier one.
  const totalNote =
    servedWindow && !servedWindow.isCurrentMonth
      ? `At the close of ${monthLabel(referenceMonth)} · the accounts below show today's balance`
      : `At the close of ${monthLabel(referenceMonth)}`;

  return (
    <>
      <div className='presentation__card__title__container flx-row-sb'>
       {/* Beside the name, as on the bank panel. "Accounts balance", not "capital invested": that is
           the tile's subtitle (capitalContributed, what went in); this is what the accounts hold. */}
       <CardTitle
        legend={
         <PanelTotal
          variant='inline'
          label='Accounts balance'
          amount={investment?.ledgerBalance ?? null}
          currency={investment?.currency ?? defaultCurrency}
         />
        }
        subtitle={investment ? totalNote : null}
       >
        Investment Accounts
       </CardTitle>
        <Link className='flx-col-center icon ' to={'edit'} viewTransition></Link>
      </div>

      <article className='goals__investment'>
        {investmentAccountsToRender!.map((account) => {
          const {
            account_name,
            account_balance,
            account_type_name,
            account_id,
            currency_code,
            account_starting_amount,
          } = account;

          // Null and not 0: an account with no starting amount, or one opened
          // at zero, has nothing to measure the result against. Zero would
          // claim the account broke even.
          const capital = account_starting_amount;
          const balance = account_balance;

          let balanceType: 'Profit' | 'Loss' | null = null;
          let percentage: number | null = null;

          if (capital != null && capital !== 0) {
            balanceType = balance < capital ? 'Loss' : 'Profit';
            // The denominator takes the magnitude so a negative opening cannot
            // flip the sign of a result the name already carries.
            percentage = (Math.abs(balance - capital) / Math.abs(capital)) * 100;
          }

          {
            return (
              <Link
                to={`account/${account_id}`} // OverviewAccountReading route; AccountDetail's is plural
                state={{ previousRoute, detailedData: account }}
                className='tile__container tile__container--account flx-col-sb'
                key={`account-${account_id}`}
                viewTransition
              >
                <div className='tile__container tile__container--investment flx-row-sb'>
                  <div className='tile__container__col tile__container__col--investment col--investment'>
                    <div className='tile__title tile__title--account'>
                      {account_name} ({account_type_name})
                    </div>

                    <div className='tile__subtitle tile__subtitle--account'>
                      {' '}
                      {subtitle}:
                      <span className='tile__title tile__title--account'>
                        {/* The capital, not the balance: showing the balance would
                            print one figure under two names and leave the
                            percentage without a visible denominator. */}
                        {capital == null
                          ? DASH
                          : currencyFormat(
                              currency_code ?? defaultCurrency,
                              capital,
                              formatNumberCountry,
                            )}
                      </span>
                    </div>
                  </div>

                  <div className='tile__container__col tile__container__col--investment col--investment--right'>
                    <div className='tile__title  tile__title--account'>
                      <span style={{ fontWeight: 'normal' }}>{concept}:</span>{' '}
                      {currencyFormat(
                        currency_code ?? defaultCurrency,
                        account_balance,
                        formatNumberCountry,
                      )}
                    </div>

                    <div className='tile__status--investment--right '>
                      <StatusSquare
                        alert={balanceType === 'Loss' ? 'alert' : ''}
                      />
                      <div className='tile__subtitle subtitle__status__investment--right '>
                        <span style={{ color: 'black', fontSize: '0.875rem' }}>
                          {/* The percent sign trails the number: '% Profit 12'
                              read as a sign belonging to the word. */}
                          {percentage === null
                            ? DASH
                            : `${balanceType} ${Math.floor(percentage)} %`}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            );
          }

        })}
      </article>
      
    </>
  );
}

export default InvestmentAccountBalance;
