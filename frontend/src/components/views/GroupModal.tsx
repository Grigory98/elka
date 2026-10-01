import { SyntheticEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HostGroup, ItemType } from "../../../bindings/terminator-desktop/backend/internal/services/blob";
import { useCredentials } from "@/hooks/useCredentials";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

interface GroupModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (group: HostGroup) => void;
    initialData?: HostGroup | null;
    isSaving: boolean;
}

export function GroupModal({isOpen, onClose, onSave, initialData, isSaving}: GroupModalProps) {
    const {t} = useTranslation(["groups", "common"]);
    const [name, setName] = useState("");
    const [credentialId, setCredentialId] = useState("");
    const {data: credentials} = useCredentials();

    useEffect(() => {
        if (isOpen) {
            setName(initialData?.name || "");
            setCredentialId(initialData?.credentialId || "");
        }
    }, [isOpen, initialData]);

    const handleSubmit = (event: SyntheticEvent<HTMLFormElement>) => {
        event.preventDefault();
        onSave(new HostGroup({
            id: initialData?.id || "",
            type: ItemType.TypeGroup,
            name: name.trim(),
            credentialId: credentialId || undefined,
        }));
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{initialData ? t("edit_title") : t("new_title")}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="group-name">{t("name_label")}</Label>
                        <Input
                            id="group-name"
                            autoFocus
                            required
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label>{t("group_credential_label")}</Label>
                        <Select value={credentialId || "none"} onValueChange={(value) => setCredentialId(value === "none" ? "" : value)}>
                            <SelectTrigger><SelectValue placeholder={t("select_group_credential")}/></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">{t("no_group_credential")}</SelectItem>
                                {credentials?.map((credential) => (
                                    <SelectItem key={credential.id} value={credential.id}>{credential.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">{t("group_credential_help")}</p>
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
                            {t("cancel", {ns: "common"})}
                        </Button>
                        <Button type="submit" disabled={isSaving || !name.trim()}>
                            {isSaving ? t("saving", {ns: "common"}) : t("save")}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
