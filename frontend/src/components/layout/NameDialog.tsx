import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface NameDialogProps {
    open: boolean;
    title: string;
    initialName: string;
    onCancel: () => void;
    onSubmit: (name: string) => void;
    /** Overrides the confirming button label, which otherwise reads "Save". */
    confirmLabel?: string;
}

export function NameDialog({open, title, initialName, onCancel, onSubmit, confirmLabel}: NameDialogProps) {
    const {t} = useTranslation(["terminal", "common"]);
    const [name, setName] = useState(initialName);

    useEffect(() => {
        if (open) setName(initialName);
    }, [open, initialName]);

    return (
        <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
            <DialogContent className="sm:max-w-sm">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                </DialogHeader>
                <form
                    onSubmit={(event) => {
                        event.preventDefault();
                        const trimmedName = name.trim();
                        if (trimmedName) onSubmit(trimmedName);
                    }}
                    className="space-y-4"
                >
                    <Input
                        autoFocus
                        required
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                    />
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={onCancel}>
                            {t("cancel", {ns: "common"})}
                        </Button>
                        <Button type="submit" disabled={!name.trim()}>
                            {confirmLabel || t("save", {ns: "common"})}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
