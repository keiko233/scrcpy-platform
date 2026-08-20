import type { Dispatch, SetStateAction } from "react";
import { useLocalStorage } from "react-use";
import type { z } from "zod";

export function useSafeLocalStorage<T>(
  key: string,
  schema: z.ZodType<T>,
  initialValue: T,
): [T, Dispatch<SetStateAction<T>>, () => void] {
  const [storedValue, setStoredValue, removeStoredValue] = useLocalStorage<
    unknown
  >(key, initialValue);

  const parsedValue = schema.safeParse(storedValue);
  const value = parsedValue.success ? parsedValue.data : initialValue;

  const setValue: Dispatch<SetStateAction<T>> = (nextValue) => {
    setStoredValue((currentValue: unknown) => {
      const currentParsedValue = schema.safeParse(currentValue);
      const currentValueOrInitial = currentParsedValue.success
        ? currentParsedValue.data
        : initialValue;

      const next = typeof nextValue === "function"
        ? (nextValue as (currentValue: T) => T)(currentValueOrInitial)
        : nextValue;

      return schema.parse(next);
    });
  };

  return [value, setValue, removeStoredValue];
}
