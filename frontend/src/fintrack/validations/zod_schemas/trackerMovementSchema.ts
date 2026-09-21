import {z} from 'zod';
import { currencySchema, noteSchema, numberSchema, requiredStringSchema, roundAmountToCurrency } from './commonSchemas';

export const expenseSchema = z.object(
 {
  amount:numberSchema,
  account:requiredStringSchema,
  category:requiredStringSchema,
  note:noteSchema,
  currency:currencySchema,
  }).transform(roundAmountToCurrency);

export const incomeSchema = z.object(
 {
  amount:numberSchema,
  account:requiredStringSchema,
  source:requiredStringSchema,
  note:noteSchema,
  currency:currencySchema,
  }
  ).transform(roundAmountToCurrency);

export const transferSchema = z.object({
  amount: numberSchema,
  origin: requiredStringSchema,
  destination: requiredStringSchema,
  originAccountType: z.enum(['bank', 'investment','category_budget']),
  destinationAccountType: z.enum(['bank', 'investment', 'income_source']),
  note: noteSchema,
  currency: currencySchema
}).refine(
  data => {
    // Compare only when both accounts are set.
    if (!data.origin || !data.destination) return true;
    return data.origin !== data.destination;
  },
  {
    message: "Accounts must be different",
    path: ["destination"]
  }
)
// Business rule: an expense category and an income source never transfer to
// each other. A reversal goes back through a bank or investment account.
.refine(
  data =>
    !(data.originAccountType === 'category_budget' &&
      data.destinationAccountType === 'income_source'),
  {
    message: "An expense reversal cannot go to an income source",
    path: ["destination"]
  }
)
.transform(roundAmountToCurrency)
  
