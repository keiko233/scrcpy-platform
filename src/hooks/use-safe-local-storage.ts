import type { Dispatch, SetStateAction } from "react";
import { useLocalStorage } from "react-use";
import type { z } from "zod";

export function useSafeLocalStorage<T>(
  key: string,
  schema: z.ZodType<T>,
): [T, Dispatch<SetStateAction<T>>, () => void] {
  const [storedValue, setStoredValue, removeStoredValue] = useLocalStorage<
    unknown
  >(key, undefined);

  const fallback = schema.parse(undefined);

  const parsedValue = schema.safeParse(storedValue);
  const value = parsedValue.success ? parsedValue.data : fallback;

  const setValue: Dispatch<SetStateAction<T>> = (nextValue) => {
    setStoredValue((currentValue: unknown) => {
      const currentParsedValue = schema.safeParse(currentValue);
      const currentValueOrInitial = currentParsedValue.success
        ? currentParsedValue.data
        : fallback;

      const next = typeof nextValue === "function"
        ? (nextValue as (currentValue: T) => T)(currentValueOrInitial)
        : nextValue;

      return schema.parse(next);
    });
  };

  return [value, setValue, removeStoredValue];
}
