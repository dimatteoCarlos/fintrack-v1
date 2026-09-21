import { checkNumberFormatValue } from '../validations/utils/custom_validation';
import { currencyMinorUnit } from './functions';

// The typed text is kept as written and the value derived from it, so leaving a
// zero-decimal currency gives the typed decimals back.
export function readAmountInCurrency(
 typedAmount: string,
 currency: string,
): { amountToSave: number | undefined; displayedAmount: string } {
 const amountToSave = checkNumberFormatValue(typedAmount, currency).valueToSave;

 const displayedAmount =
  currencyMinorUnit(currency) === 0 &&
  /[.,]/.test(typedAmount) &&
  amountToSave !== undefined
   ? String(amountToSave)
   : typedAmount;

 return { amountToSave, displayedAmount };
}

// A currency with no decimals refuses the separator keystroke outright.
export function refusesDecimalSeparator(value: string, currency: string): boolean {
 return currencyMinorUnit(currency) === 0 && /[.,]/.test(value);
}
