import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GroupService, HostGroup } from "../../bindings/elka-desktop/backend/internal/services/blob";
import { handleAppError } from "@/lib/error";

export const GROUPS_QUERY_KEY = ["hostGroups"];

export function useGroups() {
    return useQuery<HostGroup[], Error>({
        queryKey: GROUPS_QUERY_KEY,
        queryFn: () => GroupService.GetAll(),
    });
}

export function useSaveGroup() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (group: HostGroup) => GroupService.Save(group),
        onSuccess: async () => {
            await queryClient.invalidateQueries({queryKey: GROUPS_QUERY_KEY});
            await queryClient.invalidateQueries({queryKey: ["hosts"]});
        },
        onError: (error) => handleAppError(error),
    });
}

export function useDeleteGroup() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) => GroupService.Delete(id),
        onSuccess: async () => {
            await queryClient.invalidateQueries({queryKey: GROUPS_QUERY_KEY});
            await queryClient.invalidateQueries({queryKey: ["hosts"]});
        },
        onError: (error) => handleAppError(error),
    });
}
