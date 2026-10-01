import { useEffect, useState } from "react";
import { useUIStore, ViewType } from "@/store/uiStore";
import { TerminalStack } from "@/components/terminal/TerminalStack";
import { HostsPage } from "@/components/views/HostsPage.tsx";
import { KeysPage } from "@/components/views/KeysPage.tsx";
import { CredentialsPage } from "@/components/views/CredentialsPage.tsx";
import { GroupsPage } from "@/components/views/GroupsPage.tsx";
import { SettingsPage } from "@/components/views/SettingsPage.tsx";

export function ContentView() {
    const {activeView} = useUIStore();
    const [visitedViews, setVisitedViews] = useState<Set<ViewType>>(() => new Set([activeView]));

    useEffect(() => {
        setVisitedViews((current) => current.has(activeView) ? current : new Set([...current, activeView]));
    }, [activeView]);

    const shouldRenderView = (view: ViewType) => visitedViews.has(view) || activeView === view;
    const viewClassName = (view: ViewType) => activeView === view ? "absolute inset-0" : "hidden";

    return (
        <main className="relative flex flex-1 overflow-hidden bg-background">

            {shouldRenderView(ViewType.Hosts) && <div className={viewClassName(ViewType.Hosts)}><HostsPage/></div>}
            {shouldRenderView(ViewType.Keys) && <div className={viewClassName(ViewType.Keys)}><KeysPage/></div>}
            {shouldRenderView(ViewType.Credentials) && <div className={viewClassName(ViewType.Credentials)}><CredentialsPage/></div>}
            {shouldRenderView(ViewType.Groups) && <div className={viewClassName(ViewType.Groups)}><GroupsPage/></div>}
            {shouldRenderView(ViewType.Settings) && <div className={viewClassName(ViewType.Settings)}><SettingsPage/></div>}

            <TerminalStack isVisible={activeView === ViewType.Terminal}/>

        </main>
    );
}
