import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ChevronDown, ChevronRight, Edit, Folder, FolderTree, MoreHorizontal, Plus, Search, Server, Trash2 } from "lucide-react";
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
import { GroupModal } from "@/components/views/GroupModal";
import { useGroups, useDeleteGroup, useSaveGroup } from "@/hooks/useGroups";
import { useKeys } from "@/hooks/useKeys";
import { useCredentials } from "@/hooks/useCredentials";
import { useHosts } from "@/hooks/useHosts";
import { useSessionStore } from "@/store/sessionStore";
import { Host, HostGroup } from "../../../bindings/terminator-desktop/backend/internal/services/blob";
import { resolveHostAuthentication, resolveJumpHosts, resolvePortForwards } from "@/lib/sshConnection";
import { HostViewPicker } from "@/components/layout/HostViewPicker";
import { HostViewMode, useUIStore } from "@/store/uiStore";
import { saveHostViewPreference } from "@/lib/viewSettings";
import { handleAppError } from "@/lib/error";
import { cn } from "@/lib/utils";

export function GroupsPage() {
    const {t} = useTranslation(["groups", "common"]);
    const {data: groups, isLoading} = useGroups();
    const {data: hosts, isLoading: hostsLoading} = useHosts();
    const saveMutation = useSaveGroup();
    const deleteMutation = useDeleteGroup();
    const [searchQuery, setSearchQuery] = useState("");
    const [viewingGroup, setViewingGroup] = useState<HostGroup | null>(null);
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
    const [detailTreeExpanded, setDetailTreeExpanded] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingGroup, setEditingGroup] = useState<HostGroup | null>(null);
    const [groupToDelete, setGroupToDelete] = useState<HostGroup | null>(null);
    const {data: keys} = useKeys();
    const {data: credentials} = useCredentials();
    const {addSession} = useSessionStore();
    const {groupViewMode, setGroupViewMode} = useUIStore();

    const filteredGroups = useMemo(() => {
        const query = searchQuery.trim().toLocaleLowerCase();
        return groups?.filter((group) => group.name.toLocaleLowerCase().includes(query));
    }, [groups, searchQuery]);

    const hostCount = (groupName: string) => hosts?.filter((host) =>
        host.group?.trim().toLocaleLowerCase() === groupName.trim().toLocaleLowerCase()
    ).length ?? 0;

    const filteredGroupHosts = useMemo(() => {
        if (!viewingGroup) return [];
        const query = searchQuery.trim().toLocaleLowerCase();
        return (hosts || []).filter((host) =>
            host.group?.trim().toLocaleLowerCase() === viewingGroup.name.trim().toLocaleLowerCase() &&
            (
                host.name.toLocaleLowerCase().includes(query) ||
                host.host.toLocaleLowerCase().includes(query) ||
                host.username.toLocaleLowerCase().includes(query)
            )
        );
    }, [hosts, searchQuery, viewingGroup]);

    const hostsByGroup = useMemo(() => {
        const grouped = new Map<string, Host[]>();
        for (const host of hosts || []) {
            const key = host.group?.trim().toLocaleLowerCase() || "";
            grouped.set(key, [...(grouped.get(key) || []), host]);
        }
        return grouped;
    }, [hosts]);

    const openNew = () => {
        setEditingGroup(null);
        setIsModalOpen(true);
    };

    const handleSave = (group: HostGroup) => {
        saveMutation.mutate(group, {onSuccess: () => {
            if (editingGroup && viewingGroup?.id === editingGroup.id) {
                setViewingGroup(group);
            }
            setIsModalOpen(false);
        }});
    };

    const handleDelete = () => {
        if (groupToDelete) {
            if (viewingGroup?.id === groupToDelete.id) {
                setViewingGroup(null);
            }
            deleteMutation.mutate(groupToDelete.id);
        }
        setGroupToDelete(null);
    };

    const openGroup = (group: HostGroup) => {
        if (groupViewMode === "tree" && !viewingGroup) {
            setExpandedGroups((current) => {
                const next = new Set(current);
                if (next.has(group.id)) next.delete(group.id);
                else next.add(group.id);
                return next;
            });
            return;
        }
        setSearchQuery("");
        setDetailTreeExpanded(false);
        setViewingGroup(group);
    };

    const hostsForGroup = (group: HostGroup) => hostsByGroup.get(group.name.trim().toLocaleLowerCase()) || [];

    const connectHost = (host: Host) => {
        try {
            const auth = resolveHostAuthentication(host, keys || [], credentials || [], groups || []);
            addSession({
                host: host.host,
                port: host.port,
                ...auth,
                jumpHosts: resolveJumpHosts(host, hosts || [], keys || [], credentials || [], groups || []),
                portForwards: resolvePortForwards(host),
                title: host.name || host.host,
            });
        } catch (error) {
            handleAppError(error);
        }
    };

    const changeViewMode = (mode: HostViewMode) => {
        setGroupViewMode(mode);
        saveHostViewPreference("groupViewMode", mode).catch(handleAppError);
    };

    const renderHost = (host: Host, compact: boolean, treeNode = false) => (
        <button
            key={host.id}
            type="button"
            onClick={() => connectHost(host)}
            className={cn(
                "flex min-w-0 items-center gap-4 text-left transition-all hover:border-primary/40 hover:bg-muted/40",
                compact
                    ? "w-full rounded-md px-3 py-2"
                    : "rounded-xl border border-border bg-card p-5 shadow-sm hover:shadow-md",
                treeNode && "relative before:absolute before:-left-4 before:top-1/2 before:w-4 before:border-t before:border-border before:content-['']"
            )}
        >
            <div className={cn("flex shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary", compact ? "size-8" : "size-10")}>
                <Server className={compact ? "size-4" : "size-5"}/>
            </div>
            <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-card-foreground">{host.name || host.host}</span>
                <span className="block truncate text-xs text-muted-foreground">{host.username} · {host.host}:{host.port}</span>
            </span>
        </button>
    );

    return (
        <div className="app-scrollbar flex h-full w-full flex-col overflow-y-auto p-8">
            <div className="mb-8 flex w-full items-center gap-4">
                {viewingGroup ? (
                    <>
                        <Button variant="ghost" size="icon" onClick={() => {
                            setViewingGroup(null);
                            setSearchQuery("");
                        }} title={t("back_to_groups")}>
                            <ArrowLeft className="size-5"/>
                        </Button>
                        <h1 className="shrink-0 truncate text-2xl font-bold tracking-tight text-foreground">{viewingGroup.name}</h1>
                    </>
                ) : (
                    <h1 className="shrink-0 text-2xl font-bold tracking-tight text-foreground">{t("page_title")}</h1>
                )}
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/>
                    <Input
                        placeholder={viewingGroup ? t("search_hosts") : t("search")}
                        className="w-full border-border bg-input/50 pl-9"
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                    />
                </div>
                <HostViewPicker value={groupViewMode} onChange={changeViewMode}/>
                {!viewingGroup && <Button onClick={openNew} className="shrink-0"><Plus/>{t("new_group")}</Button>}
            </div>

            {!viewingGroup && isLoading && <p className="text-sm text-muted-foreground">{t("loading")}</p>}
            {!viewingGroup && !isLoading && groups?.length === 0 && (
                <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border py-16 text-center">
                    <h3 className="text-lg font-semibold text-foreground">{t("empty_title")}</h3>
                    <p className="mb-4 mt-2 text-sm text-muted-foreground">{t("empty_description")}</p>
                    <Button variant="outline" onClick={openNew}>{t("new_group")}</Button>
                </div>
            )}

            {!viewingGroup && <div className={groupViewMode === "tree"
                ? "flex w-full flex-col divide-y divide-border rounded-lg border border-border"
                : groupViewMode === "list"
                    ? "flex w-full flex-col divide-y divide-border rounded-lg border border-border"
                : "grid w-full gap-4"}
                style={groupViewMode === "tree" ? undefined : {gridTemplateColumns: "repeat(auto-fit, minmax(20rem, 1fr))"}}
            >
                {filteredGroups?.map((group) => (
                    <div key={group.id} className={groupViewMode === "tree"
                        ? "group flex flex-wrap items-center border-b border-border last:border-b-0"
                        : groupViewMode === "list"
                            ? "group flex items-center justify-between border-b border-border bg-transparent last:border-b-0 hover:bg-muted/40"
                        : "group flex items-center justify-between rounded-xl border border-border bg-card shadow-sm transition-all hover:border-primary/40 hover:shadow-md"}
                    >
                        <button
                            type="button"
                            onClick={() => openGroup(group)}
                            aria-expanded={groupViewMode === "tree" ? expandedGroups.has(group.id) : undefined}
                            className={cn(
                                "flex min-w-0 items-center gap-3 text-left hover:bg-muted/40",
                                groupViewMode === "tree" || groupViewMode === "list" ? "flex-1 px-3 py-3" : "flex-1 gap-4 p-5"
                            )}
                        >
                            {groupViewMode === "tree" && (expandedGroups.has(group.id)
                                ? <ChevronDown className="size-4 text-muted-foreground"/>
                                : <ChevronRight className="size-4 text-muted-foreground"/>)}
                            <div className={cn("flex shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary", groupViewMode === "cards" ? "size-10" : "size-8")}>
                                <Folder className={groupViewMode === "cards" ? "size-5" : "size-4"}/>
                            </div>
                            <span className="min-w-0 flex-1">
                                <span className="block truncate font-semibold text-card-foreground">{group.name}</span>
                                <span className="text-xs text-muted-foreground">
                                    {t("host_count", {count: hostCount(group.name)})}
                                </span>
                            </span>
                        </button>
                        <div className="flex shrink-0 items-center pr-4">
                            <DropdownMenu modal={false}>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon-sm" className="opacity-60 transition-opacity group-hover:opacity-100 hover:opacity-100 data-[state=open]:opacity-100 focus-visible:opacity-100">
                                        <MoreHorizontal className="size-4 text-muted-foreground"/>
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="z-50 w-40">
                                    <DropdownMenuItem onClick={() => {
                                        setEditingGroup(group);
                                        setIsModalOpen(true);
                                    }}>
                                        <Edit className="mr-2 size-4"/>{t("edit", {ns: "common"})}
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator/>
                                    <DropdownMenuItem
                                        onClick={() => setGroupToDelete(group)}
                                        className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                                    >
                                        <Trash2 className="mr-2 size-4"/>{t("delete", {ns: "common"})}
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                        {groupViewMode === "tree" && expandedGroups.has(group.id) && (
                            <div className="basis-full ml-6 border-l border-border pl-4">
                                {hostsForGroup(group).map((host) => renderHost(host, true, true))}
                            </div>
                        )}
                    </div>
                ))}
            </div>}

            {!viewingGroup && !isLoading && groups && groups.length > 0 && filteredGroups?.length === 0 && (
                <p className="text-sm text-muted-foreground">{t("no_matches")}</p>
            )}

            {viewingGroup && groupViewMode === "cards" && filteredGroupHosts.length > 0 && (
                <div className="grid w-full gap-4" style={{gridTemplateColumns: "repeat(auto-fit, minmax(20rem, 1fr))"}}>
                    {filteredGroupHosts.map((host) => renderHost(host, false))}
                </div>
            )}
            {viewingGroup && groupViewMode === "list" && filteredGroupHosts.length > 0 && (
                <div className="flex w-full flex-col divide-y divide-border rounded-lg border border-border">
                    {filteredGroupHosts.map((host) => renderHost(host, true))}
                </div>
            )}
            {viewingGroup && groupViewMode === "tree" && filteredGroupHosts.length > 0 && (
                <div className="w-full">
                    <button
                        type="button"
                        aria-expanded={detailTreeExpanded}
                        onClick={() => setDetailTreeExpanded((expanded) => !expanded)}
                        className="mb-2 flex w-full items-center gap-2 rounded-md px-2 py-2 text-left font-medium text-foreground hover:bg-muted/40"
                    >
                        {detailTreeExpanded
                            ? <ChevronDown className="size-4 text-muted-foreground"/>
                            : <ChevronRight className="size-4 text-muted-foreground"/>}
                        <FolderTree className="size-4 text-muted-foreground"/>
                        <span>{viewingGroup.name}</span>
                        <span className="text-xs text-muted-foreground">{filteredGroupHosts.length}</span>
                    </button>
                    {detailTreeExpanded && <div className="ml-2 border-l border-border pl-4">
                        {filteredGroupHosts.map((host) => renderHost(host, true, true))}
                    </div>}
                </div>
            )}
            {viewingGroup && !hostsLoading && filteredGroupHosts.length === 0 && (
                <p className="text-sm text-muted-foreground">
                    {searchQuery ? t("no_host_matches") : t("empty_group")}
                </p>
            )}

            <GroupModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={handleSave}
                initialData={editingGroup}
                isSaving={saveMutation.isPending}
            />
            <ConfirmModal
                isOpen={!!groupToDelete}
                onClose={() => setGroupToDelete(null)}
                onConfirm={handleDelete}
                title={t("delete_title")}
                description={t("delete_description", {name: groupToDelete?.name})}
                confirmText={t("delete", {ns: "common"})}
                isDestructive
            />
        </div>
    );
}
