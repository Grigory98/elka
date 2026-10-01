import { CredentialKind, Host, HostGroup, JumpHopMode, JumpHostHop, SavedCredential, SavedKey } from "../../bindings/terminator-desktop/backend/internal/services/blob";
import { SSHJumpHostConfig, SSHPortForward } from "../../bindings/terminator-desktop/backend/internal/services/ssh";

export function resolveHostAuthentication(
    host: Host,
    keys: SavedKey[] = [],
    credentials: SavedCredential[] = [],
    groups: HostGroup[] = [],
) {
    const localCombined = credentials.find((credential) => credential.id === host.credentialId);
    const group = groups.find((item) => item.name.trim().toLocaleLowerCase() === host.group?.trim().toLocaleLowerCase());
    const inheritedCredential = credentials.find((credential) => credential.id === group?.credentialId);
    const combined = host.credentialId ? localCombined : inheritedCredential;
    const passwordCredential = credentials.find((credential) => credential.id === host.passwordCredentialId);
    const passphraseCredential = credentials.find((credential) => credential.id === host.passphraseCredentialId);
    const privateKeyCredential = credentials.find((credential) => credential.id === host.privateKeyCredentialId);
    const key = keys.find((savedKey) => savedKey.id === host.keyId);

    const password = host.password ||
        passwordCredential?.password ||
        (passwordCredential?.kind === CredentialKind.CredentialKindPassword ? passwordCredential.secret : "") ||
        combined?.password ||
        (combined?.kind === CredentialKind.CredentialKindPassword ? combined.secret : "") || "";

    const privateKeyPassphrase = host.usePasswordAsPassphrase
        ? password
        : host.passphrase ||
            passphraseCredential?.passphrase ||
            (passphraseCredential?.kind === CredentialKind.CredentialKindPassphrase ? passphraseCredential.secret : "") ||
            combined?.passphrase ||
            (combined?.kind === CredentialKind.CredentialKindPassphrase ? combined.secret : "") || "";

    const privateKey = privateKeyCredential?.privateKey ||
        (privateKeyCredential?.kind === CredentialKind.CredentialKindPrivateKey ? privateKeyCredential.secret : "") ||
        key?.privateKey ||
        combined?.privateKey ||
        (combined?.kind === CredentialKind.CredentialKindPrivateKey ? combined.secret : "") ||
        "";

    return {
        username: host.username || passwordCredential?.username || combined?.username || "",
        password,
        privateKey,
        privateKeyPassphrase,
    };
}

export function resolveJumpHosts(
    host: Host,
    hosts: Host[] = [],
    keys: SavedKey[] = [],
    credentials: SavedCredential[] = [],
    groups: HostGroup[] = [],
): SSHJumpHostConfig[] {
    const hops = host.jumpHops?.length
        ? host.jumpHops
        : host.jumpHostId
            ? [new JumpHostHop({mode: JumpHopMode.JumpHopSavedHost, hostId: host.jumpHostId})]
            : [];
    const currentHostAuth = resolveHostAuthentication(host, keys, credentials, groups);

    return hops.map((hop) => {
        const jumpHost = hop.mode === JumpHopMode.JumpHopSavedHost
            ? hosts.find((item) => item.id === hop.hostId)
            : undefined;
        if (hop.mode === JumpHopMode.JumpHopSavedHost && !jumpHost) {
            throw new Error(`Saved jump host ${hop.hostId || ""} was not found`);
        }

        const auth = jumpHost
            ? resolveHostAuthentication(jumpHost, keys, credentials, groups)
            : currentHostAuth;
        return new SSHJumpHostConfig({
            host: jumpHost?.host || hop.host,
            port: jumpHost?.port || hop.port,
            username: auth.username,
            password: auth.password,
            privateKey: auth.privateKey,
            privateKeyPassphrase: auth.privateKeyPassphrase,
        });
    });
}

export function resolvePortForwards(host: Host): SSHPortForward[] {
    return (host.portForwards || []).map((forward) => new SSHPortForward({...forward}));
}
