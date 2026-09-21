// The Activity section behind GET /overview/activity. Its period is chosen by the reader, not bound to the
// reference month. It computes no total, count or currency: six domains' rows would add expenses to income.

import { getActivityPage } from '../db/overviewPageRepository.js';

export const overviewActivityService = {
 /**
  * Everything GET /overview/activity returns, for one range and one page.
  *
  * The range is echoed back because an unbounded read is the default, so a
  * response naming no range could not be told apart from the one the client asked for.
  *
  * @param {string} userId - UUID from the token, never from the client body
  * @param {object} request - { from, to, search, movementType, page, pageSize }, already validated
  */
 async getActivity(
  pool,
  userId,
  { from, to, search, movementType, page, pageSize },
  timeZone = 'UTC',
 ) {
  const { rows, totalRows } = await getActivityPage(
   pool,
   userId,
   {
    from: from ?? null,
    to: to ?? null,
    search: search ?? null,
    movementType: movementType ?? null,
   },
   timeZone,
   { page, pageSize },
  );

  return {
   transactions: {
    rows,
    page,
    pageSize,
    totalRows,
   },
   // null rather than an omitted key: the section does have a range, the reader
   // just left that end unbounded.
   range: {
    from: from ?? null,
    to: to ?? null,
   },
   // Echoed like the range: five rows out of two thousand is a filtered list, not
   // a short one, and the client cannot tell after a reload restores the query from the URL.
   filters: {
    search: search ?? null,
    movementType: movementType ?? null,
   },
  };
 },
};
