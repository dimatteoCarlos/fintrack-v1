// Where a level-2 row leads, built from the identity the row already carries: no
// lookup or conversion between the row and the URL. Every path mirrors a route in App.tsx.

export type LevelThreeLink = {
 to: string;
 // The destination's back arrow reads it, so the reader returns to level 2 on
 // the month they were studying.
 state?: { previousRoute: string };
};

// The reading variant of the route: Overview is a reading surface. Null for the
// income row no account is attributed to; it renders unlinked.
export const accountLink = (
 accountId: number | null,
 origin: string,
): LevelThreeLink | null =>
 accountId === null
  ? null
  : {
     to: `/fintrack/overview/account/${accountId}`,
     state: { previousRoute: origin },
    };

// The route names it :debtorId and DebtorDetailReading reads it back as the
// account id, so the row's accountId passes through unchanged.
export const debtorLink = (accountId: number, origin: string): LevelThreeLink => ({
 to: `/fintrack/debts/debtor/${accountId}`,
 state: { previousRoute: origin },
});

// A pocket id, never an account id.
export const pocketLink = (pocketId: number, origin: string): LevelThreeLink => ({
 to: `/fintrack/pocket/pockets/${pocketId}`,
 state: { previousRoute: origin },
});

// The name is a route segment, so it is encoded: migration 013 restricts no character, and '/' breaks it.
// The origin travels in the URL because history state survives one navigation only; a return through a
// child would otherwise fall back to /fintrack/budget. The month stays out of `from` (see withMonthParam).
export const categoryLink = (
 categoryName: string,
 month: string | null,
 origin?: string,
): LevelThreeLink => {
 const path = `/fintrack/budget/category/${encodeURIComponent(categoryName)}`;

 const params = new URLSearchParams();
 if (month) params.set('month', month);
 if (origin) params.set('from', origin);

 const query = params.toString();

 return { to: query ? `${path}?${query}` : path };
};
