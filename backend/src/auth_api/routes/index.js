import express from 'express';
import authRoutes from './authRoutes.js';
import userRoutes from './userRoutes.js';
import { authDetectClienttype } from '../middlewares/authDetectClienttype.js';

// Route for testing.
const router = express.Router();
router.get('/auth/ping', (req, res) => {
  res.json({ pong: true, module: 'auth', status: 'ready' });
});

console.log('File:indx.js', 'index routes');

router.use('/auth', authDetectClienttype, authRoutes);

router.use('/user', userRoutes);

export default router;
