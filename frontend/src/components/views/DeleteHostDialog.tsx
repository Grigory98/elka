import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { jumpHostDependents } from "@/lib/sshConnection";
import { Host } from "../../../bindings/elka-desktop/backend/internal/services/blob";

interface DeleteHostDialogProps {
    host: Host | null;
    /** Every known host, used to work out which chains this host stands in. */
    hosts: Host[];
    onClose: () => void;
    onConfirm: () => void;
}

/**
 * Подтверждение удаления хоста.
 *
 * Если хост стоит шагом в чужой цепочке, подтверждение перечисляет эти цепочки: без него удаление
 * молча укорачивало цепь, и вкладка начинала идти к цели напрямую — в обход джампа либо в никуда.
 * Само отвязывание всё равно происходит автоматически на стороне хранилища, и после удаления об этом
 * сообщается отдельной подсказкой: молча пропавший шаг хуже, чем названный заранее.
 */
export function DeleteHostDialog({host, hosts, onClose, onConfirm}: DeleteHostDialogProps) {
    const {t} = useTranslation(["hosts", "common"]);
    const dependents = host ? jumpHostDependents(host.id, hosts) : [];

    return (
        <ConfirmModal
            isOpen={!!host}
            onClose={onClose}
            onConfirm={onConfirm}
            title={t("delete_title")}
            description={t("delete_desc", {name: host?.name || host?.host || ""})}
            confirmText={t("delete", {ns: "common"})}
            isDestructive={true}
        >
            {dependents.length > 0 && <JumpDependents dependents={dependents}/>}
        </ConfirmModal>
    );
}

function JumpDependents({dependents}: {dependents: Host[]}) {
    const {t} = useTranslation(["hosts", "common"]);

    return (
        <div className="grid gap-2 rounded-md border border-border bg-muted/40 p-3 text-left">
            <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                <AlertTriangle className="size-4 shrink-0 text-amber-600 dark:text-amber-400"/>
                {t("delete_jump_used_title")}
            </span>
            <ul className="app-scrollbar max-h-32 list-disc overflow-y-auto pl-5 text-sm text-muted-foreground">
                {dependents.map((dependent) => (
                    <li key={dependent.id} className="truncate">
                        {dependent.name || `${dependent.username}@${dependent.host}`}
                    </li>
                ))}
            </ul>
            <p className="text-xs text-muted-foreground">{t("delete_jump_used_desc")}</p>
        </div>
    );
}