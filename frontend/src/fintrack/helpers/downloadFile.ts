// Authenticated GET that answers a file, saved under the server's name. axios keeps responseType on errors,
// so a 400/403/422 also arrives as a Blob: the error path parses it as text instead of saving it.

import { AxiosError } from 'axios';
import { authFetch } from '../../auth/auth_utils/authFetch';

const FILENAME_PATTERN = /filename="?([^";]+)"?/;

const filenameFrom = (contentDisposition: string | undefined, fallback: string): string =>
 contentDisposition?.match(FILENAME_PATTERN)?.[1] ?? fallback;

const errorMessageFrom = async (error: unknown): Promise<string> => {
 const data = (error as AxiosError<Blob>)?.response?.data;

 if (data instanceof Blob) {
  try {
   const parsed = JSON.parse(await data.text()) as { message?: string };
   if (parsed.message) return parsed.message;
  } catch {
   // The error body was not JSON either; fall through to the generic message.
  }
 }

 return error instanceof Error ? error.message : 'The file could not be downloaded.';
};

/**
 * @param fallbackFilename - used only when the server sent no Content-Disposition
 * @throws {Error} the server's own message when the request failed
 */
export const downloadFile = async (
 url: string,
 params: Record<string, string>,
 fallbackFilename: string,
): Promise<void> => {
 try {
  const response = await authFetch<Blob>(url, {
   method: 'GET',
   params,
   responseType: 'blob',
  });

  const filename = filenameFrom(response.headers['content-disposition'], fallbackFilename);
  const blobUrl = URL.createObjectURL(response.data);

  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(blobUrl);
 } catch (error) {
  throw new Error(await errorMessageFrom(error));
 }
};
