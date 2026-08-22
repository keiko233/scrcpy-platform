import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect } from "react";

import type {
  FlowRunDto,
  ResumeFlowRunInput,
  StartFlowRunInput,
  StopFlowRunInput,
} from "@/shared/run-contracts";

export const FLOW_RUN_QUERY_KEY = "flow-run" as const;
export const flowRunQueryKey = [FLOW_RUN_QUERY_KEY] as const;
export const flowRunQueryFn = (): Promise<FlowRunDto | null> =>
  window.androidPlatform.getFlowRun();

export function useFlowRunQuery() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: flowRunQueryKey,
    queryFn: flowRunQueryFn,
    staleTime: 0,
    gcTime: Infinity,
  });

  useEffect(() => {
    return window.androidPlatform.onFlowRun((run) => {
      queryClient.setQueryData<FlowRunDto | null>(flowRunQueryKey, run);
    });
  }, [queryClient]);

  return query;
}

export function useStartFlowRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: StartFlowRunInput) =>
      window.androidPlatform.startFlowRun(input),
    onSuccess: (result) => {
      if (result.status === "ok") {
        queryClient.setQueryData<FlowRunDto | null>(flowRunQueryKey, result.run);
      }
    },
  });
}

export function useStopFlowRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: StopFlowRunInput) =>
      window.androidPlatform.stopFlowRun(input),
    onSuccess: (result) => {
      if (result.status === "ok") {
        queryClient.setQueryData<FlowRunDto | null>(flowRunQueryKey, result.run);
      }
    },
  });
}

export function useResumeFlowRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ResumeFlowRunInput) =>
      window.androidPlatform.resumeFlowRun(input),
    onSuccess: (result) => {
      if (result.status === "ok") {
        queryClient.setQueryData<FlowRunDto | null>(flowRunQueryKey, result.run);
      }
    },
  });
}