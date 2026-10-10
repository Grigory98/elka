import { Server, Key, KeyRound, FolderTree, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUIStore, ViewType } from "@/store/uiStore";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { ServerMetricsPanel } from "@/components/layout/ServerMetricsPanel";
import type { ReactNode } from "react";
import { useState } from "react";

interface SidebarItemProps {
    title: string;
    active: boolean;
    onClick: () => void;
    children: ReactNode;
    indicatorClassName?: string;
}

function SidebarItem({title, active, onClick, children, indicatorClassName}: SidebarItemProps) {
    const [isHovered, setIsHovered] = useState(false);

    return (
        <div
            className="sidebar-tooltip-parent group relative"
            onPointerEnter={() => setIsHovered(true)}
            onPointerLeave={() => setIsHovered(false)}
            onFocusCapture={() => setIsHovered(true)}
            onBlurCapture={() => setIsHovered(false)}
        >
            <Button
                variant={active ? "secondary" : "ghost"}
                size="icon"
                onClick={onClick}
                className="wails-no-drag"
                title={title}
                aria-label={title}
            >
                {children}
                {indicatorClassName && (
                    <span className={cn("absolute right-1 top-1 size-2 rounded-full border border-sidebar", indicatorClassName)}/>
                )}
            </Button>
            <span
                role="tooltip"
                className="sidebar-tooltip pointer-events-none absolute left-full top-1/2 z-[100] ml-2 -translate-y-1/2 whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md transition-opacity"
                style={{opacity: isHovered ? 1 : 0}}
            >
                {title}
            </span>
        </div>
    );
}

export function Sidebar() {
    const {t} = useTranslation(["hosts", "keys", "credentials", "groups", "settings"]);
    const {activeView, setActiveView, isSidebarVisible, setSelectedHostGroup} = useUIStore();

    return (
        // Анимируется только ширина: содержимое живёт во внутреннем блоке фиксированной ширины,
        // поэтому иконки и метрики не сжимаются вместе с панелью, а подсказки по-прежнему могут
        // выезжать за её край, пока панель раскрыта.
        <aside
            className={cn(
                "wails-no-drag relative z-30 flex shrink-0 flex-col",
                "transition-[width] duration-200 ease-out motion-reduce:transition-none",
                isSidebarVisible ? "w-14" : "w-0 overflow-hidden border-r-0"
            )}
            aria-hidden={!isSidebarVisible}
        >
            <div className="pointer-events-none absolute inset-0 rounded-t-xl bg-sidebar" aria-hidden="true"/>

            {/* Нижние элементы панели держат тот же отступ от нижней границы вкладки при любой её
                высоте: значение выведено из --tab-height в main.css. */}
            <div className={cn(
                "relative z-10 flex h-full w-14 shrink-0 flex-col items-center justify-between pb-[var(--sidebar-bottom)] pt-2",
                // Уезжает влево и гаснет вместе с шириной панели: на первом кадре схлопывания всё
                // ещё видно, поэтому подсказка под курсором не обрезается наполовину.
                "transition-[opacity,transform] duration-150 ease-out motion-reduce:transition-none",
                isSidebarVisible ? "opacity-100" : "pointer-events-none -translate-x-2 opacity-0"
            )}>
            {/* Иконки и показатели лежат в одной группе, но ширины у них разные: ширина панели
                    не должна растягивать список иконок, иначе те съезжают с центра. */}
                <div className="flex flex-col items-center gap-3">
                    <nav className="flex flex-col items-center gap-2">
                        <SidebarItem
                            title={t("page_title", {ns: "hosts"})}
                            active={activeView === ViewType.Hosts}
                            onClick={() => {
                                setSelectedHostGroup(null);
                                setActiveView(ViewType.Hosts);
                            }}
                        >
                            <Server className="size-5"/>
                        </SidebarItem>

                        <SidebarItem
                            title={t("page_title", {ns: "groups"})}
                            active={activeView === ViewType.Groups}
                            onClick={() => setActiveView(ViewType.Groups)}
                        >
                            <FolderTree className="size-5"/>
                        </SidebarItem>

                        <SidebarItem
                            title={t("page_title", {ns: "keys"})}
                            active={activeView === ViewType.Keys}
                            onClick={() => setActiveView(ViewType.Keys)}
                        >
                            <Key className="size-5"/>
                        </SidebarItem>

                        <SidebarItem
                            title={t("page_title", {ns: "credentials"})}
                            active={activeView === ViewType.Credentials}
                            onClick={() => setActiveView(ViewType.Credentials)}
                        >
                            <KeyRound className="size-5"/>
                        </SidebarItem>
                    </nav>

                    {/* Показатели стоят под последней иконкой, а не у нижнего края: так они рядом
                        с той вкладкой, к которой относятся. */}
                    <ServerMetricsPanel/>
                </div>

                <nav className="flex flex-col items-center gap-2">
                    <SidebarItem
                        title={t("page_title", {ns: "settings"})}
                        active={activeView === ViewType.Settings}
                        onClick={() => setActiveView(ViewType.Settings)}
                    >
                        <Settings className="size-5"/>
                    </SidebarItem>
                </nav>
            </div>
        </aside>
    );
}
