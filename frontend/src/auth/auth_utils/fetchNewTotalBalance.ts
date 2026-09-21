import { url_get_total_account_balance_by_type } from '../../urlConfig';
import { BalanceBankRespType } from '../../fintrack/types/responseApiTypes';
import { authFetch } from './authFetch';

/** Total balance of the bank accounts, or null when the request fails. */
export async function fetchNewBalance(): Promise<number | null> {
  try {
    const url = `${url_get_total_account_balance_by_type}?type=bank&t=${Date.now()}`;

    const balanceBankResponse = await authFetch<BalanceBankRespType>(url);

    const total_balance = balanceBankResponse.data?.data.total_balance;

    if (typeof total_balance === 'number') {
      return total_balance;
    }
    return null;

  } catch (error) {
    console.error('Error fetching new balance:', error);
    return null;
  }
}
