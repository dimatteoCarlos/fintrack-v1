import { useState, useCallback } from "react";

type VisibilityState<T extends PropertyKey> = Record<T, boolean>;

/** Independent eye-toggle visibility for several password fields; all start hidden. */
export const useFieldVisibility=<T extends PropertyKey> (fields: T[]) => {
  const [visibility, setVisibility] = useState<VisibilityState<T>>(
    () => fields.reduce((acc, field) => ({ ...acc, [field]: false }), {} as VisibilityState<T>)
  );

  const toggleVisibility = useCallback((fieldName: T) => {
    setVisibility((prev) => ({ ...prev, [fieldName]: !prev[fieldName] }));
  }, []);

  const resetVisibility = useCallback(() => {
    setVisibility(fields.reduce((acc, field) => ({ ...acc, [field]: false }), {} as VisibilityState<T>));
  }, [fields]);

  return {
  visibility,
  toggleVisibility,
  resetVisibility,
  };
};

export default useFieldVisibility;
