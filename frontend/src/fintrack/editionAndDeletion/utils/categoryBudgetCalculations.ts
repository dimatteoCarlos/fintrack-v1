import {
  AccountListType,
  CategoryBudgetAccountListType,
} from '../../types/responseApiTypes';

// Type guard for category-budget accounts; the type name is compared trimmed and lowercased.
export const isCategoryBudgetAccount = (
  account: AccountListType,
): account is CategoryBudgetAccountListType => {
  return account.account_type_name.toLowerCase().trim() === 'category_budget';
};

