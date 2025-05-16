import { Router } from 'express';
import * as authController from '../controllers/auth.controller';

const router = Router();

/**
 * @route POST /register
 * @desc Register a new client with a public key
 * @access Public
 */
router.post('/register', authController.registerClient);

export default router;
