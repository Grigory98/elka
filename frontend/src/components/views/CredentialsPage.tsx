import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Edit, KeyRound, MoreHorizontal, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { CredentialModal } from "@/components/views/CredentialModal";
import { useCredentials, useDeleteCredential, useSaveCredential } from "@/hooks/useCredentials";
import { CredentialKind, SavedCredential } from "../../../bindings/terminator-desktop/backend/internal/services/blob";

function credentialParts(credential: SavedCredential) {
    return {
        password: credential.password || (credential.kind === CredentialKind.CredentialKindPassword ? credential.secret : "") || "",
        passphrase: credential.passphrase || (credential.kind === CredentialKind.CredentialKindPassphrase ? credential.secret : "") || "",
        privateKey: credential.privateKey || (credential.kind === CredentialKind.CredentialKindPrivateKey ? credential.secret : "") || "",
    };
}

export function CredentialsPage() {
    const {t} = useTranslation(["credentials", "common"]);
    const {data: credentials, isLoading} = useCredentials();
    const saveMutation = useSaveCredential();
    const deleteMutation = useDeleteCredential();
    const [searchQuery, setSearchQuery] = useState("");
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingCredential, setEditingCredential] = useState<SavedCredential | null>(null);
    const [credentialToDelete, setCredentialToDelete] = useState<SavedCredential | null>(null);

    const filteredCredentials = useMemo(() => {
        const query = searchQuery.trim().toLocaleLowerCase();
        return credentials?.filter((credential) => {
            const parts = credentialParts(credential);
            const labels = [
                credential.username,
                parts.password && t("password_kind"),
                parts.passphrase && t("passphrase_kind"),
                parts.privateKey && t("private_key_kind"),
            ].filter(Boolean).join(" ").toLocaleLowerCase();
            return credential.name.toLocaleLowerCase().includes(query) || labels.includes(query);
        });
    }, [credentials, searchQuery, t]);

    const openNew = () => {
        setEditingCredential(null);
        setIsModalOpen(true);
    };

    const handleSave = (credential: SavedCredential) => {
        saveMutation.mutate(credential, {onSuccess: () => setIsModalOpen(false)});
    };

    const handleDelete = () => {
        if (credentialToDelete) deleteMutation.mutate(credentialToDelete.id);
        setCredentialToDelete(null);
    };

    return (
        <div className="flex h-full w-full flex-col overflow-y-auto p-8">
            <div className="mb-8 flex w-full items-center gap-4">
                <h1 className="shrink-0 text-2xl font-bold tracking-tight text-foreground">{t("page_title")}</h1>
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/>
                    <Input
                        placeholder={t("search")}
                        className="w-full border-border bg-input/50 pl-9"
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                    />
                </div>
                <Button onClick={openNew} className="shrink-0"><Plus/>{t("new_credential")}</Button>
            </div>

            {isLoading && <div className="text-sm text-muted-foreground">{t("loading")}</div>}

            {!isLoading && credentials?.length === 0 && (
                <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border py-16 text-center">
                    <h3 className="text-lg font-semibold text-foreground">{t("empty_title")}</h3>
                    <p className="mb-4 mt-2 text-sm text-muted-foreground">{t("empty_description")}</p>
                    <Button variant="outline" onClick={openNew}>{t("new_credential")}</Button>
                </div>
            )}

            <div className="grid w-full gap-4" style={{gridTemplateColumns: "repeat(auto-fit, minmax(20rem, 1fr))"}}>
                {filteredCredentials?.map((credential) => (
                    <div key={credential.id} className="group flex flex-row justify-between rounded-xl border border-border bg-card shadow-sm transition-all hover:border-primary/40 hover:shadow-md">
                        <div className="flex min-w-0 flex-1 items-center gap-4 p-5">
                            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                <KeyRound className="size-5"/>
                            </div>
                            <div className="flex min-w-0 flex-col">
                                <h3 className="truncate font-semibold text-card-foreground">{credential.name}</h3>
                                <p className="text-xs text-muted-foreground">
                                    {[
                                        credentialParts(credential).password && t("password_kind"),
                                        credentialParts(credential).passphrase && t("passphrase_kind"),
                                        credentialParts(credential).privateKey && t("private_key_kind"),
                                    ].filter(Boolean).join(" · ")}
                                </p>
                                {credential.username && (
                                    <p className="text-xs text-muted-foreground">{credential.username}</p>
                                )}
                            </div>
                        </div>
                        <div className="flex shrink-0 items-center pr-4">
                            <DropdownMenu modal={false}>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon-sm" className="opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100 focus-visible:opacity-100">
                                        <MoreHorizontal className="size-4 text-muted-foreground"/>
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="z-50 w-40">
                                    <DropdownMenuItem onClick={() => {
                                        setEditingCredential(credential);
                                        setIsModalOpen(true);
                                    }}>
                                        <Edit className="mr-2 size-4"/>{t("edit", {ns: "common"})}
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator/>
                                    <DropdownMenuItem
                                        onClick={() => setCredentialToDelete(credential)}
                                        className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                                    >
                                        <Trash2 className="mr-2 size-4"/>{t("delete", {ns: "common"})}
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </div>
                ))}
            </div>

            {!isLoading && credentials && credentials.length > 0 && filteredCredentials?.length === 0 && (
                <p className="text-sm text-muted-foreground">{t("no_matches")}</p>
            )}

            <CredentialModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={handleSave}
                initialData={editingCredential}
                isSaving={saveMutation.isPending}
            />
            <ConfirmModal
                isOpen={!!credentialToDelete}
                onClose={() => setCredentialToDelete(null)}
                onConfirm={handleDelete}
                title={t("delete_title")}
                description={t("delete_description", {name: credentialToDelete?.name})}
                confirmText={t("delete", {ns: "common"})}
                isDestructive
            />
        </div>
    );
}
