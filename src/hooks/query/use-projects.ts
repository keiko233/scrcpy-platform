import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import type {
  CreateProjectInput,
  DeleteProjectInput,
  ProjectDto,
  RenameProjectInput,
} from "@/shared/project-contracts";
import { scriptsQueryKey } from "@/hooks/query/use-scripts";

export const PROJECTS_QUERY_KEY = "projects" as const;
export const projectsQueryKey = [PROJECTS_QUERY_KEY] as const;
export const projectsQueryFn = (): Promise<ProjectDto[]> =>
  window.androidPlatform.listProjects();

export function useProjects() {
  return useQuery({
    queryKey: projectsQueryKey,
    queryFn: projectsQueryFn,
    staleTime: 30_000,
    gcTime: Infinity,
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProjectInput) =>
      window.androidPlatform.createProject(input),
    onSuccess: (project) => {
      queryClient.setQueryData<ProjectDto[]>(projectsQueryKey, (current) => {
        if (current === undefined) {
          return [project];
        }
        return [...current, project];
      });
    },
  });
}

export function useRenameProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RenameProjectInput) =>
      window.androidPlatform.renameProject(input),
    onSuccess: (result) => {
      if (result.status === "ok") {
        queryClient.setQueryData<ProjectDto[]>(projectsQueryKey, (current) => {
          if (current === undefined) {
            return [result.project];
          }
          return current.map((project) =>
            project.id === result.project.id ? result.project : project,
          );
        });
      }
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: DeleteProjectInput) =>
      window.androidPlatform.deleteProject(input),
    onSuccess: (result, variables) => {
      if (result.status === "ok") {
        queryClient.setQueryData<ProjectDto[]>(projectsQueryKey, (current) => {
          if (current === undefined) {
            return current;
          }
          return current.filter((project) => project.id !== variables.projectId);
        });
        queryClient.removeQueries({
          queryKey: scriptsQueryKey(variables.projectId),
        });
      }
    },
  });
}