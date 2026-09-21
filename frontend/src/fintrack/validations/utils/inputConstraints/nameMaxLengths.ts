export const NAME_MAX_LENGTHS = {
  /** Category name (30 chars): the input's visible width at the narrowest
   * breakpoint (NewCategory.tsx `.input__container`). The category_budget_accounts
   * column allows 50, but a cap nobody can see defeats a max length. */
  category_name: 30,
  /** Subcategory name (25 chars): the category_budget_accounts column's own
   * VARCHAR(25) limit, below what the input can display, so the DB binds. */
  subcategory: 25,
  /** Note/description field (155 chars, matching the server) */
  note: 155,
  account_name: 28,
  /** Pocket name (50 chars, matching the server) */
  pocket_name: 50,
  debtor_name: 13,
  debtor_lastname: 14,
  nature_type_name: 5,
  default: 30,
} as const;

export type NameFieldType = keyof typeof NAME_MAX_LENGTHS;