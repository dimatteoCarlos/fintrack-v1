import { useCallback, useEffect, useRef } from "react";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useDebouncedCallback<F extends (...args:any[])=>void>(callback:F, delay:number):(...args:any[])=>void{

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const callbackRef = useRef(callback);
  
  const debouncedCallback = useCallback(
    (...args: Parameters<F>) => {
      if(timeoutRef.current){
        clearTimeout(timeoutRef.current);
      }
      
      timeoutRef.current = setTimeout (()=>{callbackRef.current(...args)},delay)
    }, [delay]
  )
  // Tracks the latest callback so the debounced function keeps a stable identity.
  useEffect(() => {
     callbackRef.current = callback;
   }, [callback]);

  // Clears a pending call when the debounced function changes or the component unmounts.
   useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [debouncedCallback]);

  return debouncedCallback as unknown as F
}
