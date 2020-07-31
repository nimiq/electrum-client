export function stringToBytes(str) {
    const encoder = new TextEncoder();
    return encoder.encode(str);
}
export function bytesToString(bytes) {
    const decoder = new TextDecoder('utf-8');
    return decoder.decode(bytes);
}
export function hexToBytes(hex) {
    return new Uint8Array((hex.match(/.{2}/g) || []).map(byte => parseInt(byte, 16)));
}
export function bytesToHex(bytes) {
    const HEX_ALPHABET = '0123456789abcdef';
    let hex = '';
    for (let i = 0; i < bytes.length; i++) {
        const code = bytes[i];
        hex += HEX_ALPHABET[code >>> 4];
        hex += HEX_ALPHABET[code & 0x0F];
    }
    return hex;
}
