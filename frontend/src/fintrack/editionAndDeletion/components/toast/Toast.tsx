import { useEffect } from "react";
import "./toast-styles.css"

export type ToastMessageType='success' | 'error' | 'info' | 'warning';

type ToastPropsType ={
message:string;
type:ToastMessageType;
visible: boolean;
onClose: () => void;
duration?: number;
}

function Toast({message, type, visible, onClose, duration=3000}:ToastPropsType){
const toastEmojis = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️'
  };
// Auto-closes after duration ms; a duration of 0 keeps it open.
useEffect(()=>{
if(visible && duration >0){
  const timer = setTimeout(onClose, duration)
  return ()=>clearTimeout(timer)
  } 
}, [visible, duration, onClose])
if(!visible) return null

  return (
   <div className={`toast toast--${type}`}>

    <div className="toast__content">
      <span className="toast__emoji">{toastEmojis[type]}</span>  

      <span className="toast_message">{message}</span>

      <button className="toast__close" onClick={onClose}
      aria-label = "Close notification"
      >
      </button>
    </div>
  </div>
  )
}

export default Toast;