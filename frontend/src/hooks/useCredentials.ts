import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CredentialService, SavedCredential } from "../../bindings/terminator-desktop/backend/internal/services/blob";
import { handleAppError } from "@/lib/error";

export const CREDENTIALS_QUERY_KEY = ["credentials"];

export function useCredentials() {
    return useQuery<SavedCredential[], Error>({
        queryKey: CREDENTIALS_QUERY_KEY,
        queryFn: () => CredentialService.GetAll(),
    });
}

export function useSaveCredential() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (credential: SavedCredential) => CredentialService.Save(credential),
        onSuccess: () => queryClient.invalidateQueries({queryKey: CREDENTIALS_QUERY_KEY}),
        onError: (error) => handleAppError(error),
    });
}

export function useDeleteCredential() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) => CredentialService.Delete(id),
        onSuccess: async () => {
            await queryClient.invalidateQueries({queryKey: CREDENTIALS_QUERY_KEY});
            await queryClient.invalidateQueries({queryKey: ["hosts"]});
        },
        onError: (error) => handleAppError(error),
    });
}
