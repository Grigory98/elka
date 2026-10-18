import { CredentialKind, Host, HostGroup, JumpHopMode, JumpHostHop, SavedCredential, SavedKey } from "../../bindings/elka-desktop/backend/internal/services/blob";
import { SSHJumpHostConfig, SSHPortForward } from "../../bindings/elka-desktop/backend/internal/services/ssh";
import { credentialParts } from "@/lib/credentials";

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

interface HostAuthentication {
    username: string;
    password: string;
    privateKey: string;
    privateKeyPassphrase: string;
}

/** A saved credential on its own, without a host record around it: the credentials a jump hop picks. */
function resolveCredentialAuthentication(credential: SavedCredential): HostAuthentication {
    const parts = credentialParts(credential);
    return {
        username: credential.username || "",
        password: parts.password || "",
        privateKey: parts.privateKey || "",
        privateKeyPassphrase: parts.passphrase || "",
    };
}

/** The part of the authentication the server actually checks. */
function authenticationSecret(auth: HostAuthentication) {
    return auth.password || auth.privateKey;
}

/**
 * Credentials chosen for one hop win over the ones the hop would have used on its own, and they
 * fill in a blank login but never overwrite the one already spelled out on the host.
 */
function withCredential(auth: HostAuthentication, credential: SavedCredential | undefined): HostAuthentication {
    if (!credential) return auth;
    const selected = resolveCredentialAuthentication(credential);
    return {
        username: auth.username || selected.username,
        password: selected.password || auth.password,
        privateKey: selected.privateKey || auth.privateKey,
        privateKeyPassphrase: selected.privateKeyPassphrase || auth.privateKeyPassphrase,
    };
}

/**
 * Only an explicitly manual hop is an address typed by hand.
 */
function isManualHop(hop: JumpHostHop) {
    return hop.mode === JumpHopMode.JumpHopManual;
}

/**
 * Хосты, в цепочках которых стоит этот хост шагом.
 *
 * Нужен перед удалением: без него цепочка молча укорачивается, и вкладка начинает идти напрямую к
 * цели — то есть в обход джампа, или падает, если маршрута нет.
 */
export function jumpHostDependents(hostID: string, hosts: Host[] = []): Host[] {
    if (!hostID) return [];
    return hosts.filter((host) => host.id !== hostID && (
        host.jumpHostId === hostID ||
        (host.jumpHops || []).some((hop) => !isManualHop(hop) && hop.hostId === hostID)
    ));
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
        const manual = isManualHop(hop);
        const jumpHost = manual
            ? undefined
            : hosts.find((item) => item.id === hop.hostId);
        if (!manual && !jumpHost) {
            throw new Error(`Saved jump host ${hop.hostId || ""} was not found`);
        }

        const selectedCredential = credentials.find((credential) => credential.id === hop.credentialId);
        // A jump host with nothing of its own is common: it is there to route the traffic, and the
        // group it sits in, or this host, holds the login. Falling back to this host's credentials
        // is what keeps such a chain connectable instead of failing on a hop with no auth method.
        const own = jumpHost
            ? resolveHostAuthentication(jumpHost, keys, credentials, groups)
            : currentHostAuth;
        const resolved = withCredential(own, selectedCredential);
        const auth = authenticationSecret(resolved)
            ? resolved
            : withCredential(currentHostAuth, selectedCredential);

        return new SSHJumpHostConfig({
            host: jumpHost?.host || hop.host,
            port: jumpHost?.port || hop.port,
            // An empty login never authenticates, so the one this host connects with fills the gap.
            username: auth.username || currentHostAuth.username,
            password: auth.password,
            privateKey: auth.privateKey,
            privateKeyPassphrase: auth.privateKeyPassphrase,
        });
    });
}

export function resolvePortForwards(host: Host): SSHPortForward[] {
    return (host.portForwards || []).map((forward) => new SSHPortForward({...forward}));
}
