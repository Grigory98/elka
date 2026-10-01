import { useState, useEffect, SyntheticEvent } from "react";
import {useTranslation} from "react-i18next";
import {ArrowDown, ArrowLeftRight, ArrowUp, Plus, Trash2} from "lucide-react";
import {Host, ItemType, JumpHopMode, JumpHostHop, PortForward, PortForwardMode} from "../../../bindings/terminator-desktop/backend/internal/services/blob";
import {Dialog, DialogContent, DialogHeader, DialogTitle} from "@/components/ui/dialog";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {useKeys} from "@/hooks/useKeys";
import {useCredentials} from "@/hooks/useCredentials";
import {useGroups} from "@/hooks/useGroups";
import {useHosts} from "@/hooks/useHosts";

interface HostModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (host: Host) => void;
    initialData?: Host | null;
    isSaving: boolean;
}

const DEFAULT_HOST: Partial<Host> = {
    name: "",
    host: "",
    port: 22,
    username: "",
    password: "",
    passphrase: "",
    keyId: undefined,
    passwordCredentialId: undefined,
    passphraseCredentialId: undefined,
    privateKeyCredentialId: undefined,
    credentialId: undefined,
    jumpHostId: undefined,
    jumpHops: [],
    portForwards: [],
    usePasswordAsPassphrase: false,
    group: "",
};

export function HostModal({isOpen, onClose, onSave, initialData, isSaving}: HostModalProps) {
    const {t} = useTranslation(["hosts", "common", "credentials"]);
    const [formData, setFormData] = useState<Partial<Host>>(DEFAULT_HOST);
    const {data: keys} = useKeys();
    const {data: credentials} = useCredentials();
    const {data: groups} = useGroups();
    const {data: hosts} = useHosts();
    const jumpHosts = (hosts || []).filter((host) => host.id !== formData.id);
    const selectedGroup = groups?.find((group) => group.name.trim().toLocaleLowerCase() === formData.group?.trim().toLocaleLowerCase());
    const selectedCredential = credentials?.find((credential) => credential.id === (formData.credentialId || selectedGroup?.credentialId));
    const legacyPasswordCredential = credentials?.find((credential) => credential.id === formData.passwordCredentialId);
    const inheritedUsername = legacyPasswordCredential?.username || selectedCredential?.username;

    useEffect(() => {
        if (isOpen) {
            if (initialData) {
                const jumpHops = initialData.jumpHops?.length
                    ? initialData.jumpHops
                    : initialData.jumpHostId
                        ? [new JumpHostHop({mode: JumpHopMode.JumpHopSavedHost, hostId: initialData.jumpHostId})]
                        : [];
                setFormData({...initialData, jumpHops});
            } else {
                setFormData(DEFAULT_HOST);
            }
        }
    }, [isOpen, initialData]);

    const handleSubmit = (e: SyntheticEvent<HTMLFormElement>) => {
        e.preventDefault();

        const jumpHops = (formData.jumpHops || []).filter((hop) => hop.mode === JumpHopMode.JumpHopSavedHost
            ? !!hop.hostId
            : !!hop.host?.trim() && (hop.port || 0) > 0 && (hop.port || 0) <= 65535);

        const finalHost = new Host({
            ...formData,
            id: formData.id || "",
            type: ItemType.TypeHost,
            port: Number(formData.port) || 22,
            keyId: formData.keyId === "none" ? undefined : formData.keyId,
            passwordCredentialId: formData.credentialId ? undefined : formData.passwordCredentialId === "none" ? undefined : formData.passwordCredentialId,
            passphraseCredentialId: formData.credentialId ? undefined : formData.passphraseCredentialId === "none" ? undefined : formData.passphraseCredentialId,
            privateKeyCredentialId: formData.credentialId ? undefined : formData.privateKeyCredentialId === "none" ? undefined : formData.privateKeyCredentialId,
            credentialId: formData.credentialId === "none" ? undefined : formData.credentialId,
            jumpHostId: jumpHops.length === 0 && formData.jumpHostId !== "none" ? formData.jumpHostId : undefined,
            jumpHops,
            portForwards: (formData.portForwards || []).filter((forward) =>
                forward.listenPort > 0 && forward.listenPort <= 65535 &&
                forward.targetPort > 0 && forward.targetPort <= 65535 &&
                forward.targetAddress.trim() !== ""
            ),
            group: formData.group?.trim() || undefined,
        });

        onSave(finalHost);
    };

    const isEditing = !!initialData;

    const jumpHops = formData.jumpHops || [];
    const hasIncompleteJumpHop = jumpHops.some((hop) => hop.mode === JumpHopMode.JumpHopSavedHost
        ? !hop.hostId
        : !hop.host?.trim() || (hop.port || 0) < 1 || (hop.port || 0) > 65535);

    const updateJumpHop = (index: number, update: Partial<JumpHostHop>) => {
        setFormData({
            ...formData,
            jumpHops: jumpHops.map((hop, currentIndex) =>
                currentIndex === index ? new JumpHostHop({...hop, ...update}) : hop
            ),
        });
    };

    const moveJumpHop = (index: number, offset: number) => {
        const destination = index + offset;
        if (destination < 0 || destination >= jumpHops.length) return;
        const updated = [...jumpHops];
        [updated[index], updated[destination]] = [updated[destination], updated[index]];
        setFormData({...formData, jumpHops: updated});
    };

    const addJumpHop = () => {
        setFormData({
            ...formData,
            jumpHops: [...jumpHops, new JumpHostHop({
                mode: JumpHopMode.JumpHopSavedHost,
                hostId: "",
                host: "",
                port: 22,
            })],
        });
    };

    const removeJumpHop = (index: number) => {
        setFormData({...formData, jumpHops: jumpHops.filter((_, currentIndex) => currentIndex !== index)});
    };

    const updatePortForward = (index: number, update: Partial<PortForward>) => {
        const forwards = formData.portForwards || [];
        setFormData({
            ...formData,
            portForwards: forwards.map((forward, currentIndex) =>
                currentIndex === index ? new PortForward({...forward, ...update}) : forward
            ),
        });
    };

    const addPortForward = () => {
        setFormData({
            ...formData,
            portForwards: [
                ...(formData.portForwards || []),
                new PortForward({
                    mode: PortForwardMode.PortForwardLocal,
                    listenAddress: "127.0.0.1",
                    listenPort: 0,
                    targetAddress: "127.0.0.1",
                    targetPort: 0,
                }),
            ],
        });
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{isEditing ? t("edit_title") : t("new_title")}</DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="flex flex-col gap-4 py-4">
                    <div className="order-1 grid gap-2">
                        <Label htmlFor="name">{t("host_name_label", {ns: "hosts"})}</Label>
                        <Input
                            id="name"
                            value={formData.name || ""}
                            onChange={(e) =>
                                setFormData({...formData, name: e.target.value})}
                        />
                    </div>

                    <div className="order-3 grid grid-cols-4 gap-4">
                        <div className="col-span-3 grid gap-2">
                            <Label htmlFor="host">{t("host_ip", {ns: "common"})}</Label>
                            <Input
                                id="host"
                                required
                                value={formData.host || ""}
                                onChange={(e) =>
                                    setFormData({...formData, host: e.target.value})}
                            />
                        </div>
                        <div className="col-span-1 grid gap-2">
                            <Label htmlFor="port">{t("port", {ns: "common"})}</Label>
                            <Input
                                id="port"
                                type="number"
                                required
                                value={formData.port === undefined ? "" : formData.port}
                                onChange={(e) => {
                                    const val = parseInt(e.target.value);
                                    setFormData({...formData, port: isNaN(val) ? undefined : val});
                                }}
                            />
                        </div>
                    </div>

                    <div className="order-4 grid gap-2">
                        <Label htmlFor="username">{t("username", {ns: "common"})}</Label>
                        <Input
                            id="username"
                            required={!formData.username?.trim() && !inheritedUsername}
                            value={formData.username || ""}
                            onChange={(e) =>
                                setFormData({...formData, username: e.target.value})}
                        />
                    </div>

                    <div className="order-5 grid gap-2">
                        <Label htmlFor="password">{t("password_label", {ns: "hosts"})}</Label>
                        <Input
                            id="password"
                            type="password"
                            value={formData.password || ""}
                            onChange={(e) =>
                                setFormData({...formData, password: e.target.value})}
                        />
                    </div>

                    <div className="order-6 grid gap-2">
                        <Label>{t("ssh_key_label", {ns: "hosts"})}</Label>
                        <Select
                            value={formData.keyId || "none"}
                            onValueChange={(val) => setFormData({
                                ...formData,
                                keyId: val === "none" ? undefined : val,
                                privateKeyCredentialId: undefined,
                            })}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder={t("select_key_placeholder")}/>
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">{t("none_use_password")}</SelectItem>
                                {keys?.map((key) => (
                                    <SelectItem key={key.id} value={key.id}>
                                        {key.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="order-9 grid gap-3 rounded-lg border border-border p-3">
                        <div className="flex items-center justify-between gap-2">
                            <div className="flex flex-col">
                                <Label>{t("jump_chain", {ns: "hosts"})}</Label>
                                <span className="text-xs text-muted-foreground">{t("jump_chain_help", {ns: "hosts"})}</span>
                            </div>
                            <Button type="button" variant="outline" size="sm" onClick={addJumpHop}>
                                <Plus className="mr-1 size-4"/>{t("add_jump_hop", {ns: "hosts"})}
                            </Button>
                        </div>
                        {jumpHops.map((hop, index) => (
                            <div key={index} className="grid gap-3 rounded-md bg-muted/30 p-3">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-xs font-medium text-muted-foreground">
                                        {t("jump_hop_number", {ns: "hosts", number: index + 1})}
                                    </span>
                                    <div className="flex items-center">
                                        <Button type="button" variant="ghost" size="icon-sm" disabled={index === 0} title={t("move_jump_up", {ns: "hosts"})} onClick={() => moveJumpHop(index, -1)}>
                                            <ArrowUp className="size-4"/>
                                        </Button>
                                        <Button type="button" variant="ghost" size="icon-sm" disabled={index === jumpHops.length - 1} title={t("move_jump_down", {ns: "hosts"})} onClick={() => moveJumpHop(index, 1)}>
                                            <ArrowDown className="size-4"/>
                                        </Button>
                                        <Button type="button" variant="ghost" size="icon-sm" title={t("remove_jump_hop", {ns: "hosts"})} onClick={() => removeJumpHop(index)}>
                                            <Trash2 className="size-4"/>
                                        </Button>
                                    </div>
                                </div>
                                <Select
                                    value={hop.mode || JumpHopMode.JumpHopSavedHost}
                                    onValueChange={(value) => updateJumpHop(index, {
                                        mode: value as JumpHopMode,
                                        hostId: "",
                                        host: "",
                                        port: 22,
                                    })}
                                >
                                    <SelectTrigger><SelectValue/></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={JumpHopMode.JumpHopSavedHost}>{t("jump_saved_host", {ns: "hosts"})}</SelectItem>
                                        <SelectItem value={JumpHopMode.JumpHopManual}>{t("jump_manual_host", {ns: "hosts"})}</SelectItem>
                                    </SelectContent>
                                </Select>
                                {hop.mode === JumpHopMode.JumpHopManual ? (
                                    <div className="grid grid-cols-4 gap-3">
                                        <div className="col-span-3 grid gap-1">
                                            <Label>{t("jump_server_address", {ns: "hosts"})}</Label>
                                            <Input required value={hop.host || ""} onChange={(event) => updateJumpHop(index, {host: event.target.value})}/>
                                        </div>
                                        <div className="col-span-1 grid gap-1">
                                            <Label>{t("port", {ns: "common"})}</Label>
                                            <Input required type="number" min={1} max={65535} value={hop.port || ""} onChange={(event) => updateJumpHop(index, {port: Number(event.target.value) || 0})}/>
                                        </div>
                                    </div>
                                ) : (
                                    <Select value={hop.hostId || "none"} onValueChange={(hostId) => updateJumpHop(index, {hostId: hostId === "none" ? "" : hostId})}>
                                        <SelectTrigger><SelectValue placeholder={t("select_jump_host", {ns: "hosts"})}/></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">{t("select_jump_host", {ns: "hosts"})}</SelectItem>
                                            {jumpHosts.map((host) => (
                                                <SelectItem key={host.id} value={host.id}>{host.name || `${host.username}@${host.host}:${host.port}`}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}
                            </div>
                        ))}
                        {hasIncompleteJumpHop && <p className="text-xs text-destructive">{t("complete_jump_hops", {ns: "hosts"})}</p>}
                    </div>

                    <div className="order-10 grid gap-3 rounded-lg border border-border p-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-sm font-medium">
                                <ArrowLeftRight className="size-4"/>
                                {t("port_forwarding", {ns: "hosts"})}
                            </div>
                            <Button type="button" variant="outline" size="sm" onClick={addPortForward}>
                                <Plus className="mr-1 size-4"/>{t("add_forward", {ns: "hosts"})}
                            </Button>
                        </div>
                        {(formData.portForwards || []).map((forward, index) => (
                            <div key={index} className="grid gap-3 rounded-md bg-muted/30 p-3">
                                <div className="flex items-center gap-2">
                                    <Select
                                        value={forward.mode}
                                        onValueChange={(value) => updatePortForward(index, {mode: value as PortForwardMode})}
                                    >
                                        <SelectTrigger><SelectValue/></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value={PortForwardMode.PortForwardLocal}>{t("local_forward", {ns: "hosts"})}</SelectItem>
                                            <SelectItem value={PortForwardMode.PortForwardRemote}>{t("remote_forward", {ns: "hosts"})}</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon-sm"
                                        title={t("remove_forward", {ns: "hosts"})}
                                        onClick={() => setFormData({
                                            ...formData,
                                            portForwards: (formData.portForwards || []).filter((_, itemIndex) => itemIndex !== index),
                                        })}
                                    >
                                        <Trash2 className="size-4"/>
                                    </Button>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="grid gap-1">
                                        <Label>{forward.mode === PortForwardMode.PortForwardLocal
                                            ? t("local_listen_address", {ns: "hosts"})
                                            : t("remote_listen_address", {ns: "hosts"})}</Label>
                                        <Input value={forward.listenAddress} onChange={(event) => updatePortForward(index, {listenAddress: event.target.value})}/>
                                    </div>
                                    <div className="grid gap-1">
                                        <Label>{forward.mode === PortForwardMode.PortForwardLocal
                                            ? t("local_listen_port", {ns: "hosts"})
                                            : t("remote_listen_port", {ns: "hosts"})}</Label>
                                        <Input type="number" min={1} max={65535} required value={forward.listenPort || ""} onChange={(event) => updatePortForward(index, {listenPort: Number(event.target.value) || 0})}/>
                                    </div>
                                    <div className="grid gap-1">
                                        <Label>{forward.mode === PortForwardMode.PortForwardLocal
                                            ? t("remote_target_address", {ns: "hosts"})
                                            : t("local_target_address", {ns: "hosts"})}</Label>
                                        <Input required value={forward.targetAddress} onChange={(event) => updatePortForward(index, {targetAddress: event.target.value})}/>
                                    </div>
                                    <div className="grid gap-1">
                                        <Label>{forward.mode === PortForwardMode.PortForwardLocal
                                            ? t("remote_target_port", {ns: "hosts"})
                                            : t("local_target_port", {ns: "hosts"})}</Label>
                                        <Input type="number" min={1} max={65535} required value={forward.targetPort || ""} onChange={(event) => updatePortForward(index, {targetPort: Number(event.target.value) || 0})}/>
                                    </div>
                                </div>
                            </div>
                        ))}
                        <p className="text-xs text-muted-foreground">{t("forward_help", {ns: "hosts"})}</p>
                    </div>

                    <div className="order-8 grid gap-2">
                        <Label>{t("saved_credential_label", {ns: "credentials"})}</Label>
                        <Select
                            value={formData.credentialId || "none"}
                            onValueChange={(value) => setFormData({
                                ...formData,
                                credentialId: value === "none" ? undefined : value,
                                passwordCredentialId: undefined,
                                passphraseCredentialId: undefined,
                                privateKeyCredentialId: undefined,
                            })}
                        >
                            <SelectTrigger><SelectValue placeholder={t("select_credential", {ns: "credentials"})}/></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">{t("no_saved_credential", {ns: "credentials"})}</SelectItem>
                                {credentials?.map((credential) => (
                                    <SelectItem key={credential.id} value={credential.id}>{credential.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="order-7 grid gap-2">
                        <Label htmlFor="passphrase">{t("passphrase_label", {ns: "credentials"})}</Label>
                        <Input
                            id="passphrase"
                            type="password"
                            value={formData.passphrase || ""}
                            onChange={(e) => setFormData({...formData, passphrase: e.target.value})}
                        />
                    </div>

                    <label className="order-7 flex cursor-pointer items-center gap-2 text-sm">
                        <input
                            type="checkbox"
                            checked={formData.usePasswordAsPassphrase || false}
                            onChange={(e) => setFormData({...formData, usePasswordAsPassphrase: e.target.checked})}
                            className="size-4 accent-primary"
                        />
                        {t("use_password_as_passphrase", {ns: "credentials"})}
                    </label>

                    <div className="order-2 grid gap-2">
                        <Label>{t("group_label", {ns: "hosts"})}</Label>
                        <Select
                            value={formData.group || "none"}
                            onValueChange={(value) => setFormData({...formData, group: value === "none" ? undefined : value})}
                        >
                            <SelectTrigger><SelectValue placeholder={t("select_group", {ns: "hosts"})}/></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">{t("no_group", {ns: "hosts"})}</SelectItem>
                                {groups?.map((group) => (
                                    <SelectItem key={group.id} value={group.name}>{group.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {selectedGroup?.credentialId && !formData.credentialId && (
                            <p className="text-xs text-muted-foreground">
                                {t("inherited_group_credential", {ns: "credentials", name: selectedCredential?.name})}
                            </p>
                        )}
                    </div>

                    <div className="order-11 mt-4 flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
                            {t("cancel", {ns: "common"})}
                        </Button>
                        <Button type="submit" disabled={isSaving || hasIncompleteJumpHop}>
                            {isSaving ? t("saving", {ns: "common"}) : t("save_host")}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
