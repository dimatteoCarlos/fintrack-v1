// Toast notifications styled by HTTP status code.
import {toast, ToastOptions, TypeOptions} from 'react-toastify'

type StatusToastConfig = {
  color:string;
  type:TypeOptions;
}
const statusToastMap = (status: number): StatusToastConfig => {
  if (status >= 200 && status < 300) return { type: 'success', color: '#289e43ff' };
  if (status >= 400 && status < 500) return { type: 'error', color: '#dc3545' };
  if (status >= 500) return { type: 'warning', color: '#ffc107' };
  return { type: 'default', color: '#17a2b8' };
};

export const showToastByStatus = (
  message: string,
  status: number,
  options?: ToastOptions
) => {
  const { type, color } = statusToastMap(status);

  toast(message, {
    type,
    style: { backgroundColor: color, color: '#fff' },
    icon: false,
    ...options,
  });
};