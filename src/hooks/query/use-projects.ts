import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import type {
  CreateProjectInput,
  ProjectDto,
} from "@/shared/project-contracts";

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