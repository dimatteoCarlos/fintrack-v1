import { z } from 'zod';
import { DB_MAX_LENGTHS } from '../../validations/utils/constants.ts';
import {
  noteSchema,
  optionalButNotEmptySchema,
} from './commonEditionSchemas.ts';

export const baseAccountEditSchema = z.object({
  account_name: optionalButNotEmptySchema(DB_MAX_LENGTHS.account_name),
  note: noteSchema(DB_MAX_LENGTHS.note),
});

export type BaseAccountEditFormData = z.infer<typeof baseAccountEditSchema>;

export const categoryBudgetEditShema = baseAccountEditSchema.extend({
  // No budget key: the amount is edited by EditAccount's budget block through
  // PUT /budget/accounts/:accountId/current, and the field config omits it too.
  category_name: optionalButNotEmptySchema(DB_MAX_LENGTHS.category_name),
  subcategory: optionalButNotEmptySchema(DB_MAX_LENGTHS.subcategory),
  category_nature_type_name: z
    .enum(['must', 'need', 'other', 'want'])
    .optional(),
  // account_name is derived, so it is optional here: Zod must not block the
  // state while 'compute' runs.
  account_name: optionalButNotEmptySchema(DB_MAX_LENGTHS.account_name),
});

export type CategoryBudgetEditFormData = z.infer<
  typeof categoryBudgetEditShema
>;

export const debtorAccountEditSchema = baseAccountEditSchema.extend({
  debtor_name: optionalButNotEmptySchema(DB_MAX_LENGTHS.debtor_name),
  debtor_lastname: optionalButNotEmptySchema(DB_MAX_LENGTHS.debtor_lastname),
  account_name: optionalButNotEmptySchema(DB_MAX_LENGTHS.account_name),
});

export type DebtorAccountEditFormData = z.infer<typeof debtorAccountEditSchema>;

export const accountTypeEditSchemas:
Record<string, z.ZodObject<Record<string, z.ZodTypeAny>>> = {
  bank: baseAccountEditSchema,
  investment: baseAccountEditSchema,
  income_source: baseAccountEditSchema,
  category_budget: categoryBudgetEditShema,
  debtor: debtorAccountEditSchema,
};
