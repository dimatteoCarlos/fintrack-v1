import axios, { AxiosRequestConfig, Method } from 'axios';
import { useCallback, useState } from 'react';
import { authFetch } from '../../auth/auth_utils/authFetch';

// A domain error arrives as a stable code, a sentence and the values it mentions. Branch on code
// (prose gets rewritten or translated); message is the fallback for a condition with no code yet.
export type RequestFailureType = {
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

export type FetchResponseType<R, D = unknown> = {
  data: R | null;
  isLoading: boolean;
  // The message alone; consumers that ignore `failure` keep working.
  error: string | null;
  // Set only when the server declared a code; a network failure, an abort or an
  // error without one leaves it null and fills `error` only.
  failure: RequestFailureType | null;
  // The HTTP status the response actually carried. Distinct from failure.code
  // (the domain identity): a caller needs this transport-level number to color
  // a toast correctly instead of assuming success by default.
  status: number | null;
  requestFn: (
    payload: D,
    overrideConfig?: AxiosRequestConfig,
  ) => Promise<{
    data: R | null;
    error: string | null;
    failure: RequestFailureType | null;
    status: number | null;
  }>;
  resetFn?: () => void;
};

type useFetchArgType = {
  url: string;
  method: Method;
  initialConfig?: AxiosRequestConfig;
};
/** Authenticated mutation (POST/PUT/DELETE): returns a requestFn to call on demand. */
export function useFetchLoad<R, D = unknown>({
  url: initialUrl,
  method = 'POST',
  initialConfig,
}: useFetchArgType): FetchResponseType<R, D> {
  const [data, setData] = useState<R | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failure, setFailure] = useState<RequestFailureType | null>(null);
  const [status, setStatus] = useState<number | null>(null);

  const requestFn = useCallback(
    async (
      payload: D,
      overrideConfig?: AxiosRequestConfig,
    ): Promise<{
      data: R | null;
      error: string | null;
      failure: RequestFailureType | null;
      status: number | null;
    }> => {
      setIsLoading(true);
      setError(null);
      setFailure(null);
      setStatus(null);

      let localData: R | null = null; // local copy for the immediate return
      let errorMessage: string | null = null;
      let localFailure: RequestFailureType | null = null;
      let localStatus: number | null = null;

      try {
        const requestConfig: AxiosRequestConfig = {
          ...initialConfig,
          method,
          url: initialUrl,
          data: payload,
          withCredentials: true,
          ...(overrideConfig || {}), // last, so it can override url, method or anything above
        };

        const response = await authFetch<R>(requestConfig.url!, requestConfig);

        if (response.status >= 200 && response.status < 300) {
          localData = response.data as R;
          localStatus = response.status;
          setData(localData);
          setStatus(localStatus);
        } else {
          throw new Error(`Unexpected status code: ${response.status}`);
        }
      } catch (err: unknown) {
        if (axios.isAxiosError(err) && err.response?.data?.message) {
          errorMessage = err.response.data.message;
          localStatus = err.response.status ?? null;
          setError(errorMessage);
          setStatus(localStatus);

          // The code, when declared, is read from the same body as the message so
          // the rejection arrives whole.
          const body = err.response.data;

          if (typeof body.error === 'string' && body.error !== '') {
            localFailure = {
              code: body.error,
              message: errorMessage as string,
              ...(body.details ? { details: body.details } : {}),
            };
            setFailure(localFailure);
          }
        }
        // If it's a standard Error (e.g., thrown from authFetch or this function)
        else if (err instanceof Error) {
          errorMessage = err.message;
          setError(errorMessage);
        }
        else {
          errorMessage = 'Unexpected error occurred';
          setError(errorMessage);
        }

        console.error('Error:', errorMessage);
        setData(null);
        setError(errorMessage);
      } finally {
        setIsLoading(false);
      }

      return {
        data: localData,
        error: errorMessage,
        failure: localFailure,
        status: localStatus,
      };
    },
    [initialUrl, initialConfig, method],
  );
  const resetFn = useCallback(() => {
    setData(null);
    setError(null);
    setFailure(null);
    setStatus(null);
    setIsLoading(false);
  }, []);

  return { data, isLoading, error, failure, status, requestFn, resetFn };
}
