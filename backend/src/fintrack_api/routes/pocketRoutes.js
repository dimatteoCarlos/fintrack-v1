// Pocket routes. Mounted under /api/fintrack, already behind verifyToken in
// app.js; every handler resolves identity from the token via
// requireUserId, and no route accepts a user ID from the client.

import express from 'express';
import {
 getPocketBoard,
 exportPocketBoard,
 getPocketDetail,
 createPocket,
 editPocket,
 allocateToPocket,
 releaseFromPocket,
 deletePocketById,
} from '../controllers/pocketController.js';

const router = express.Router();

// GET /api/fintrack/pocket/board
// No parameters: header totals and list both come from this one answer of every pocket the caller owns.
// Declared before /:pocketId, which would otherwise match 'board' as an id.
router.get('/board', getPocketBoard);

// GET /api/fintrack/pocket/export?month=YYYY-MM&format=csv|xlsx
// One row per pocket as csv, or a workbook whose second sheet lists every commitment and release.
// Declared before /:pocketId, like /board.
router.get('/export', exportPocketBoard);

// POST /api/fintrack/pocket
// { name, note?, targetAmount, currency, desiredDate }
// Created empty; currency is the unit the target was TYPED in, converted and stored by the server.
router.post('/', createPocket);

// PATCH /api/fintrack/pocket/:pocketId
// { name?, note?, targetAmount?, currency?, desiredDate? }
// Target and date are one decision; the pocket's currency is not editable (it would restate allocations).
router.patch('/:pocketId', editPocket);

// POST /api/fintrack/pocket/:pocketId/allocations
// { sourceAccountId, amount, currency, allocationDate? }
// The amount is always positive; the ceiling is the source account's unassigned cash, checked under a lock.
router.post('/:pocketId/allocations', allocateToPocket);

// POST /api/fintrack/pocket/:pocketId/releases
// Same body; the amount is positive and the server writes the row negative. Ceiling: what the pocket holds
// from that one account.
router.post('/:pocketId/releases', releaseFromPocket);

// DELETE /api/fintrack/pocket/:pocketId
// Never refused for a non-zero net: the cash was only committed. The answer names each source account and
// the amount returning to its unassigned cash.
router.delete('/:pocketId', deletePocketById);

// GET /api/fintrack/pocket/:pocketId
// Hero, source breakdown and allocation history are views of the same rows, so one request serves all
// three and they cannot disagree.
router.get('/:pocketId', getPocketDetail);

export default router;
