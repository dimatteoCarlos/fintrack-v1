/**
 * An error that declares its own HTTP status and optionally its identity. errorCode is the stable
 * name a client branches on (the message wording is not the contract); details holds the
 * already-parsed values. Both are omitted from the response when absent.
 *
 * @param {string} message - for a human
 * @param {{errorCode?: string, details?: object}} [identity] - for a machine
 */
export function createError(statusCode, message, identity = {}) {
  const err = new Error(message);
  err.status = statusCode;

  if (identity.errorCode) {
    err.errorCode = identity.errorCode;
  }

  if (identity.details) {
    err.details = identity.details;
  }

  console.log('Running create error fn:', 'status:',err.status, err.message);
  return err;
}

export const handlePostgresError = (error) => {
  // An error with .status is application-built (a pg error carries .code, never .status);
  // without this the default demotes a domain 400 to 500. errorCode and details travel with it.
  if (error?.status) {
    return {
      code: error.status,
      message: error.message,
      errorCode: error.errorCode,
      details: error.details,
    };
  }

  let code = 500;
  let message = error?.message || 'Internal server error';

  switch (error?.code) {
    case '23514': // CHECK constraint violation
      code = 400;
      message = 'Constraint violation: The start date cannot be in the future.';
      break;

    case '23505': // UNIQUE constraint violation
      code = 409;
      message = 'Constraint violation: The record already exists.';
      break;

    case '23503': // FOREIGN KEY constraint violation
      code = 400;
      message = 'Constraint violation: Invalid foreign key.';
      break;

    case '22P02': // Invalid data type error
      code = 400;
      message = 'Data type error: The provided value is not valid.';
      break;

    default:
      break;
  }

  return { code, message };
};
