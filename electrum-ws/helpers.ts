export function stringToBytes(str: string) {
    const encoder = new TextEncoder(); // utf-8 is the default
    return encoder.encode(str);
}

export function bytesToString(bytes: BufferSource) {
    const decoder = new TextDecoder('utf-8');
    return decoder.decode(bytes);
}

export function hexToBytes(hex: string) {
    return new Uint8Array((hex.match(/.{2}/g) || []).map(byte => parseInt(byte, 16)));
}

export function bytesToHex(bytes: Uint8Array) {
    const HEX_ALPHABET = '0123456789abcdef';

    let hex = '';
    for (let i = 0; i < bytes.length; i++) {
        const code = bytes[i];
        hex += HEX_ALPHABET[code >>> 4];
        hex += HEX_ALPHABET[code & 0x0F];
    }
    return hex;
}
