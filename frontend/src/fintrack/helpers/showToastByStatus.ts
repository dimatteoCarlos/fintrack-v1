// Toast notifications styled by HTTP status code.
import {toast, ToastOptions, TypeOptions} from 'react-toastify'

type StatusToastConfig = {
  color:string;
  type:TypeOptions;
  // Undefined for success/info, which fall back to ToastContainer's own
  // autoClose. Error and warning set their own: the container's default is
  // tuned for a confirmation, not a rejection sentence to read and act on.
  autoClose?: number;
}
const statusToastMap = (status: number): StatusToastConfig => {
  if (status >= 200 && status < 300) return { type: 'success', color: '#289e43ff' };
  if (status >= 400 && status < 500) return { type: 'error', color: '#dc3545', autoClose: 6000 };
  if (status >= 500) return { type: 'warning', color: '#ffc107', autoClose: 6000 };
  return { type: 'default', color: '#17a2b8' };
};

export const showToastByStatus = (
  message: string,
  status: number,
  options?: ToastOptions
) => {
  const { type, color, autoClose } = statusToastMap(status);

  toast(message, {
    type,
    ...(autoClose !== undefined ? { autoClose } : {}),
    style: { backgroundColor: color, color: '#fff' },
    icon: false,
    ...options,
  });
};