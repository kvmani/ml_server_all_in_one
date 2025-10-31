import { ReactNode, createContext, useCallback, useContext, useMemo, useState } from "react";

type LoaderTask<T> = () => Promise<T> | T;

type LoadingContextValue = {
  isLoading: boolean;
  begin: () => void;
  end: () => void;
  withLoader: <T>(task: LoaderTask<T>) => Promise<T>;
};

const LoadingContext = createContext<LoadingContextValue | null>(null);

export function LoadingProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState(0);

  const begin = useCallback(() => {
    setPending((value) => value + 1);
  }, []);

  const end = useCallback(() => {
    setPending((value) => (value > 0 ? value - 1 : 0));
  }, []);

  const withLoader = useCallback(
    async <T,>(task: LoaderTask<T>) => {
      begin();
      try {
        return await Promise.resolve(task());
      } finally {
        end();
      }
    },
    [begin, end],
  );

  const value = useMemo<LoadingContextValue>(
    () => ({
      isLoading: pending > 0,
      begin,
      end,
      withLoader,
    }),
    [begin, end, pending, withLoader],
  );

  return <LoadingContext.Provider value={value}>{children}</LoadingContext.Provider>;
}

export function useLoading(): LoadingContextValue {
  const context = useContext(LoadingContext);
  if (!context) {
    throw new Error("LoadingContext is unavailable");
  }
  return context;
}
