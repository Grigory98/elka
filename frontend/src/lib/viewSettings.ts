import { AppSettings, SettingsService } from "../../bindings/terminator-desktop/backend/internal/services/settings";
import { HostViewMode } from "@/store/uiStore";

export async function saveHostViewPreference(field: "hostViewMode" | "groupViewMode", mode: HostViewMode) {
    const current = await SettingsService.GetSettings();
    await SettingsService.SaveSettings(new AppSettings({...current, [field]: mode}));
}
