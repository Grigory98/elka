import { Server, MoreHorizontal, Edit, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Host } from "../../../bindings/terminator-desktop/backend/internal/services/blob";
import { useTranslation } from "react-i18next";
import { HostViewMode } from "@/store/uiStore";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface HostCardProps {
    host: Host;
    showGroup?: boolean;
    viewMode?: HostViewMode;
    onConnect: (host: Host) => void;
    onEdit: (host: Host) => void;
    onDelete: (host: Host) => void;
}

export function HostCard({host, showGroup = true, viewMode = "cards", onConnect, onEdit, onDelete}: HostCardProps) {
    const {t} = useTranslation("common");
    const isCard = viewMode === "cards";
    const [isHovered, setIsHovered] = useState(false);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    return (
        <div
            tabIndex={0}
            onPointerEnter={() => setIsHovered(true)}
            onPointerLeave={() => setIsHovered(false)}
            onKeyDown={(e) => {
                if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) {
                    e.preventDefault();
                    onConnect(host);
                }
            }}
            className={cn(
                "group flex flex-row justify-between transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isCard
                    ? "rounded-xl border border-border bg-card shadow-sm hover:border-primary/40 hover:shadow-md"
                    : "rounded-md border-b border-border bg-transparent hover:bg-muted/40",
                isHovered && (isCard ? "border-primary/40 shadow-md" : "bg-muted/40")
            )}
        >
            <div
                onDoubleClick={() => onConnect(host)}
                title={t("double_click_to_connect")}
                className={cn("flex min-w-0 flex-1 cursor-pointer items-center gap-3", isCard ? "p-5" : "px-3 py-2")}
            >
                <div className={cn(
                    "flex shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary",
                    isCard ? "size-10" : "size-8"
                )}>
                    <Server className={cn(isCard ? "size-5" : "size-4")} />
                </div>
                <div className="flex min-w-0 flex-col pr-4">
                    <h3 className="truncate font-semibold text-card-foreground">
                        {host.name || host.host}
                    </h3>
                    <p className="truncate text-xs text-muted-foreground">
                        {host.username}
                    </p>
                    {showGroup && host.group && (
                        <span className="mt-1 w-fit rounded-full bg-secondary px-2 py-0.5 text-2xs text-secondary-foreground">
                            {host.group}
                        </span>
                    )}
                </div>
            </div>

            <div className="flex shrink-0 items-center pr-4">
                <DropdownMenu modal={false} open={isMenuOpen} onOpenChange={setIsMenuOpen}>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon-sm"
                            className={cn("transition-opacity hover:opacity-100 focus-visible:opacity-100", isHovered || isMenuOpen ? "opacity-100" : "opacity-60")}
                        >
                            <MoreHorizontal className="size-4 text-muted-foreground"/>
                        </Button>
                    </DropdownMenuTrigger>

                    <DropdownMenuContent align="end" className="w-40 z-50">
                        <DropdownMenuItem onClick={() => onEdit(host)}>
                            <Edit className="mr-2 size-4"/>
                            {t("edit")}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator/>
                        <DropdownMenuItem
                            onClick={() => onDelete(host)}
                            className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                        >
                            <Trash2 className="mr-2 size-4"/>
                            {t("delete")}
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

        </div>
    );
}
