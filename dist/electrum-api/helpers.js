import * as BitcoinJS from 'bitcoinjs-lib';
import { Buffer } from 'buffer';
import { bytesToHex, hexToBytes } from '../electrum-ws';
export function blockHeaderToPlain(header, height) {
    if (typeof header === 'string')
        header = BitcoinJS.Block.fromHex(header);
    return {
        blockHash: header.getId(),
        blockHeight: height,
        timestamp: header.timestamp,
        bits: header.bits,
        nonce: header.nonce,
        version: header.version,
        weight: header.weight(),
        prevHash: header.prevHash ? bytesToHex(new Uint8Array(header.prevHash).reverse()) : null,
        merkleRoot: header.merkleRoot ? bytesToHex(new Uint8Array(header.merkleRoot).reverse()) : null,
    };
}
export function transactionToPlain(tx, network) {
    if (typeof tx === 'string')
        tx = BitcoinJS.Transaction.fromHex(tx);
    const inputs = tx.ins.map((input, index) => inputToPlain(input, index, network));
    const outputs = tx.outs.map((output, index) => outputToPlain(output, index, network));
    const plain = {
        transactionHash: tx.getId(),
        inputs,
        outputs,
        version: tx.version,
        vsize: tx.virtualSize(),
        isCoinbase: tx.isCoinbase(),
        weight: tx.weight(),
        locktime: tx.locktime,
        replaceByFee: inputs.some(input => input.sequence < 0xfffffffe),
    };
    return plain;
}
function inputToPlain(input, index, network) {
    return {
        script: bytesToHex(input.script),
        transactionHash: bytesToHex(new Uint8Array(input.hash).reverse()),
        address: deriveAddressFromInput(input, network) || null,
        witness: input.witness.map((buf) => {
            if (typeof buf === 'number')
                return buf;
            return bytesToHex(buf);
        }),
        index,
        outputIndex: input.index,
        sequence: input.sequence,
    };
}
function outputToPlain(output, index, network) {
    let address = null;
    try {
        address = BitcoinJS.address.fromOutputScript(output.script, network);
    }
    catch (error) {
    }
    return {
        script: bytesToHex(output.script),
        address,
        value: output.value,
        index,
    };
}
function deriveAddressFromInput(input, network) {
    if (BitcoinJS.Transaction.isCoinbaseHash(input.hash))
        return undefined;
    const chunks = (BitcoinJS.script.decompile(input.script) || []);
    const witness = input.witness;
    if (chunks.length === 2 && witness.length === 0) {
        return BitcoinJS.payments.p2pkh({
            pubkey: chunks[1],
            network,
        }).address;
    }
    if (chunks.length === 1 && witness.length === 2) {
        return BitcoinJS.payments.p2sh({
            redeem: BitcoinJS.payments.p2wpkh({
                pubkey: witness[1],
                network,
            }),
        }).address;
    }
    if (chunks.length === 0 && witness.length === 2) {
        return BitcoinJS.payments.p2wpkh({
            pubkey: witness[1],
            network,
        }).address;
    }
    if (chunks.length > 2 && witness.length === 0) {
        const m = chunks.length - 2;
        const pubkeys = BitcoinJS.script.decompile(chunks[chunks.length - 1])
            .filter((n) => typeof n !== 'number');
        return BitcoinJS.payments.p2sh({
            redeem: BitcoinJS.payments.p2ms({
                m,
                pubkeys,
                network,
            }),
        }).address;
    }
    if (chunks.length === 1 && witness.length > 2) {
        const m = witness.length - 2;
        const pubkeys = BitcoinJS.script.decompile(witness[witness.length - 1])
            .filter((n) => typeof n !== 'number');
        return BitcoinJS.payments.p2sh({
            redeem: BitcoinJS.payments.p2wsh({
                redeem: BitcoinJS.payments.p2ms({
                    m,
                    pubkeys,
                    network,
                }),
            }),
        }).address;
    }
    if (chunks.length === 0 && witness.length > 2) {
        const m = witness.length - 2;
        const pubkeys = BitcoinJS.script.decompile(witness[witness.length - 1])
            .filter((n) => typeof n !== 'number');
        return BitcoinJS.payments.p2wsh({
            redeem: BitcoinJS.payments.p2ms({
                m,
                pubkeys,
                network,
            }),
        }).address;
    }
    console.error(new Error('Cannot decode address from input'));
    return undefined;
}
export function transactionFromPlain(plain) {
    const tx = new BitcoinJS.Transaction();
    tx.version = plain.version;
    tx.locktime = plain.locktime;
    tx.ins = plain.inputs.sort((a, b) => a.index - b.index).map(input => inputFromPlain(input));
    tx.outs = plain.outputs.sort((a, b) => a.index - b.index).map(output => outputFromPlain(output));
    return tx;
}
function inputFromPlain(plain) {
    return {
        hash: Buffer.from(hexToBytes(plain.transactionHash).reverse()),
        index: plain.outputIndex,
        script: Buffer.from(hexToBytes(plain.script)),
        sequence: plain.sequence,
        witness: plain.witness.map(scriptOrNumber => typeof scriptOrNumber === 'string' ? Buffer.from(hexToBytes(scriptOrNumber)) : scriptOrNumber),
    };
}
function outputFromPlain(plain) {
    return {
        script: Buffer.from(hexToBytes(plain.script)),
        value: plain.value,
    };
}
