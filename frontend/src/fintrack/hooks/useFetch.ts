import axios from 'axios';
import { useCallback, useEffect, useState } from 'react';
import { authFetch } from '../../auth/auth_utils/authFetch';

export type FetchResponseType<R> = {
  apiData: R | null;
  isLoading: boolean;
  error: string | null;
  status: number | null;
  // Re-requests the same URL. The effect keys on [url], so without this a failed
  // GET has no way back: an error must offer a retry as well as a message.
  refetch: () => void;
};
/** Authenticated GET on mount and whenever the url changes; a null url skips it. */
export function useFetch<R>(url: string | null): FetchResponseType<R> {
  const [state, setState] = useState<
    Omit<FetchResponseType<R>, 'refetch'>
  >({
    apiData: null,
    isLoading: false,
    error: null,
    status: null,
  });

  // Bumping it re-runs the same request without changing the url; a cache-busting
  // query parameter would be a different request.
  const [attempt, setAttempt] = useState(0);

  const refetch = useCallback(() => {
    setAttempt((previous) => previous + 1);
  }, []);

  useEffect(() => {
    if (!url) {
      return;
    }

    const fetchData = async () => {
      setState((prev) => ({
        ...prev,
        isLoading: true,
        error: null,
        status: null,
      }));

      try {
        const response = await authFetch<R>(url);
        setState({
          apiData: response.data,
          isLoading: false,
          error: null,
          status: response.status,
        });
      } catch (err: unknown) {
        let errorMessage = 'An unknown error occurred';
        let status: number | null = null;
        let isDataNotFoundError = false;

        if (axios.isAxiosError(err)) {
          status = err.response?.status ?? null;
          errorMessage = err.response?.data?.message || err.message;
          if (status === 404 || status === 400) {
            // Server messages that mean "empty result", not a failed request.
            const noDataMessages = [
              'No accounts of type:',
              'No transactions encountered',
              'No available accounts',
              // The summary list words it differently ('No accounts available of
              // type debtor.'), which would otherwise read as a failed request.
              'No accounts available of type',
            ];
            if (noDataMessages.some((msg) => errorMessage.includes(msg))) {
              isDataNotFoundError = true;
            }
          }
        } else if (err instanceof Error) {
          errorMessage = err.message;
        }
        // An expected empty result is not an application error: no data, error stays null.
        if (isDataNotFoundError) {
          console.warn(
            `[useFetch] Expected Data Not Found (Status ${status}):`,
            errorMessage,
          );
          setState({
            apiData: null,
            isLoading: false,
            error: null,
            status,
          });

          return;
        }
        console.error(
          '[useFetch] Fetch error:',
          errorMessage,
          'status',
          status,
        );

        setState({
          apiData: null,
          isLoading: false,
          error: errorMessage,
          status,
        });
      }
    };

    fetchData();
  }, [url, attempt]);

  return { ...state, refetch };
}
