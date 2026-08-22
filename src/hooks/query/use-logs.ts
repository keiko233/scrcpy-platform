import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect } from "react";

import type { LogEntry } from "@/shared/electron-api";

export const LOGS_QUERY_KEY = "logs" as const;
export const logsQueryKey = [LOGS_QUERY_KEY] as const;
export const logsQueryFn = (): Promise<LogEntry[]> =>
  window.androidPlatform.listLogs();

const MAX_LOGS = 500;

export interface LogsManager {
  logs: LogEntry[];
  loading: boolean;
  clearLogs: () => Promise<void>;
  clearing: boolean;
}

export function useLogs(): LogsManager {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: logsQueryKey,
    queryFn: logsQueryFn,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  useEffect(() => {
    return window.androidPlatform.onLog((entry) => {
      queryClient.setQueryData<LogEntry[]>(logsQueryKey, (current) => {
        if (current === undefined) {
          return [entry];
        }
        return [entry, ...current].slice(0, MAX_LOGS);
      });
    });
  }, [queryClient]);

  const clearLogsMutation = useMutation({
    mutationFn: () => window.androidPlatform.clearLogs(),
    onSuccess: () => {
      queryClient.setQueryData<LogEntry[]>(logsQueryKey, () => []);
    },
  });

  return {
    logs: query.data ?? [],
    loading: query.isLoading,
    clearLogs: clearLogsMutation.mutateAsync,
    clearing: clearLogsMutation.isPending,
  };
}