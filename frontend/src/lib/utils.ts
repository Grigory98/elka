import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

export function decodeBase64ToUint8Array(base64: string): Uint8Array {
    const binaryString = atob(base64);
    return Uint8Array.from(binaryString, (char) => char.charCodeAt(0));
}