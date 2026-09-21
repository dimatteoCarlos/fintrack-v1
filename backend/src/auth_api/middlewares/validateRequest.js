// Zod validation middleware: sets req.validatedData on success, answers 400 otherwise.
import { createError } from '../../utils/errorHandling.js';

export const validateRequestSync = (schema) => {
  return (req, res, next) => {
    try {
      const validationResult = schema.safeParse(req.body);
      if (!validationResult.success) {
        const flattenedErrors = validationResult.error.flatten();

        // Response shape the frontend forms read.
        const errorResponse = {
          success: false,
          error: 'ValidationError',
          message: 'Request validation failed',
          fieldErrors: flattenedErrors.fieldErrors || {},
        };
        return res.status(400).json(errorResponse);
      }

      req.validatedData = validationResult.data;
      next();
    } catch (error) {
      console.error('Validation middleware error:', error);
      next(createError(500, 'Internal validation error'));
    }
  };
};
