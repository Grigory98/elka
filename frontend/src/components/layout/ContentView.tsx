import { useUIStore, ViewType } from "@/store/uiStore";
import { TerminalStack } from "@/components/terminal/TerminalStack";
import { HostsPage } from "@/components/views/HostsPage.tsx";
import { KeysPage } from "@/components/views/KeysPage.tsx";
import { CredentialsPage } from "@/components/views/CredentialsPage.tsx";
import { GroupsPage } from "@/components/views/GroupsPage.tsx";
import { SettingsPage } from "@/components/views/SettingsPage.tsx";

export function ContentView() {
    const {activeView} = useUIStore();

    return (
        <main className="relative flex flex-1 overflow-hidden bg-background">

            {activeView === ViewType.Hosts && <HostsPage/>}
            {activeView === ViewType.Keys && <KeysPage/>}
            {activeView === ViewType.Credentials && <CredentialsPage/>}
            {activeView === ViewType.Groups && <GroupsPage/>}
            {activeView === ViewType.Settings && <SettingsPage/>}

            <TerminalStack isVisible={activeView === ViewType.Terminal}/>

        </main>
    );
}
