// Utilities for category_budget account names: parse, build, and list categories.

/**
 * Parses "category/subcategory/nature" into its parts; the two-part legacy form
 * "category/nature" yields an undefined subcategory.
 *
 * @example
 * parseCategoryAccountName("Food/Restaurants/Must")
 * // { category: "Food", subcategory: "Restaurants", nature: "Must" }
 */
export const parseCategoryAccountName = (
  fullName: string,
): { category: string; subcategory: string | undefined; nature: string } => {
  if (!fullName || typeof fullName !== 'string') {
    return { category: '', subcategory: undefined, nature: '' };
  }

  const parts = fullName.split('/').map((part) => part.trim());

  if (parts.length === 2) {
    // Legacy format: "category/nature"
    return {
      category: parts[0],
      subcategory: undefined,
      nature: parts[1] || '',
    };
  }

  if (parts.length >= 3) {
    return {
      category: parts[0],
      subcategory: parts[1] || undefined,
      nature: parts[2] || '',
    };
  }

  return {
    category: parts[0] || '',
    subcategory: undefined,
    nature: '',
  };
};

/**
 * Builds the account name in the form the server stores (lowercase). Returns ''
 * when the category, subcategory or nature is empty or whitespace: the
 * subcategory is required.
 *
 * @example
 * buildCategoryAccountName("Food", "Restaurants", "Must")
 * // "food/restaurants/must"
 */
export const buildCategoryAccountName = (
  category: string,
  subcategory: string | undefined,
  nature: string,
): string => {
  const trimmedCategory = category?.trim() || '';
  const trimmedSubcategory = subcategory?.trim() || '';
  const trimmedNature = nature?.trim() || '';

  if (!trimmedCategory || !trimmedSubcategory || !trimmedNature) {
    return '';
  }

  // Lowercase: the creation controller normalizes every part before building the name.
  return `${trimmedCategory}/${trimmedSubcategory}/${trimmedNature}`.toLowerCase();
};

/** Sorted unique categories of the given full account names. */
export const extractCategories = (fullNames: string[]): string[] => {
  if (!fullNames || fullNames.length === 0) {
    return [];
  }

  const uniqueCategories = new Set<string>();
  fullNames.forEach((name) => {
    const { category } = parseCategoryAccountName(name);
    if (category) {
      uniqueCategories.add(category);
    }
  });

  return Array.from(uniqueCategories).sort();
};

/** Sorted unique subcategories of the given full account names, skipping empty ones. */
export const extractSubcategories = (fullNames: string[]): string[] => {
  if (!fullNames || fullNames.length === 0) {
    return [];
  }

  const uniqueSubcategories = new Set<string>();
  fullNames.forEach((name) => {
    const { subcategory } = parseCategoryAccountName(name);
    if (subcategory && subcategory.length > 0) {
      uniqueSubcategories.add(subcategory);
    }
  });

  return Array.from(uniqueSubcategories).sort();
};