import { ChevronDown, GitBranch, LayoutGrid, List, Rows3 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { HostViewMode } from "@/store/uiStore";

interface HostViewPickerProps {
    value: HostViewMode;
    onChange: (mode: HostViewMode) => void;
    allowTree?: boolean;
}

export function HostViewPicker({value, onChange, allowTree = true}: HostViewPickerProps) {
    const {t} = useTranslation("settings");
    const modes: {mode: HostViewMode; label: string; icon: typeof LayoutGrid}[] = [
        {mode: "cards", label: t("view_cards"), icon: LayoutGrid},
        {mode: "list", label: t("view_list"), icon: List},
        {mode: "tree", label: t("view_tree"), icon: GitBranch},
    ];

    return (
        <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="sm" aria-label={t("host_view_mode_label")}>
                    <Rows3 className="size-4"/>
                    <span>{t("view_mode")}</span>
                    <ChevronDown className="size-3.5 text-muted-foreground"/>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuRadioGroup value={value} onValueChange={(mode) => onChange(mode as HostViewMode)}>
                    {modes.filter(({mode}) => allowTree || mode !== "tree").map(({mode, label, icon: Icon}) => (
                        <DropdownMenuRadioItem key={mode} value={mode}>
                            <Icon className="mr-2 size-4"/>{label}
                        </DropdownMenuRadioItem>
                    ))}
                </DropdownMenuRadioGroup>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
