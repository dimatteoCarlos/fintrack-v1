// Reduces any thrown value to { message, status }: an axios-style error with a
// response body, an object carrying a status, an Error, or a string. Anything
// else keeps the defaults (500, 'An error occurred').
export const normalizeError = (error: unknown): { message: string; status: number } => {
  let errorStatus = 500;
  let errorMessage = 'An error occurred';
  if (typeof error === 'object' && error !== null && 'response' in error) {

 const axiosError = error as { response?: { data?: { message?: string; status?: number } } };

  if (axiosError.response?.data) {
      errorStatus = axiosError.response.data.status || 500;
      errorMessage = axiosError.response.data.message || 'Server error';
    }
  }
  else if (typeof error === 'object' && error !== null && 'status' in error) {
const customError = error as { status: number; message?: string };
    errorStatus = customError.status;
    errorMessage = customError.message || 'Error occurred';
  }
  else if (error instanceof Error) {
    errorMessage = error.message;
  }
  else if (typeof error === 'string') {
    errorMessage = error;
  }

  return { message: errorMessage, status: errorStatus };
};