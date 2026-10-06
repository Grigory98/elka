import { CredentialKind, SavedCredential } from "../../bindings/elka-desktop/backend/internal/services/blob";

export function credentialParts(credential: SavedCredential) {
    return {
        password: credential.password || (credential.kind === CredentialKind.CredentialKindPassword ? credential.secret : "") || "",
        passphrase: credential.passphrase || (credential.kind === CredentialKind.CredentialKindPassphrase ? credential.secret : "") || "",
        privateKey: credential.privateKey || (credential.kind === CredentialKind.CredentialKindPrivateKey ? credential.secret : "") || "",
    };
}