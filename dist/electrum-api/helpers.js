import { fromOutputScript as addressFromOutputScript } from 'bitcoinjs-lib/src/address';
import { Block } from 'bitcoinjs-lib/src/block';
import { p2pkh, p2sh, p2wpkh, p2wsh, p2ms } from 'bitcoinjs-lib/src/payments';
import { decompile as scriptDecompile, OPS } from 'bitcoinjs-lib/src/script';
import { Transaction } from 'bitcoinjs-lib/src/transaction';
import { Buffer } from 'buffer';
import { bytesToHex, hexToBytes } from '../electrum-ws';
export function blockHeaderToPlain(header, height) {
    if (typeof header === 'string')
        header = Block.fromHex(header);
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
        tx = Transaction.fromHex(tx);
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
export function inputToPlain(input, index, network) {
    let address = null;
    try {
        address = deriveAddressFromInput(input, network) || null;
    }
    catch (error) {
        if (location.hostname === 'localhost')
            console.error(error);
    }
    return {
        script: bytesToHex(input.script),
        transactionHash: bytesToHex(new Uint8Array(input.hash).reverse()),
        address,
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
export function outputToPlain(output, index, network) {
    let address = null;
    try {
        address = addressFromOutputScript(output.script, network);
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
export function deriveAddressFromInput(input, network) {
    if (Transaction.isCoinbaseHash(input.hash))
        return undefined;
    const chunks = (scriptDecompile(input.script) || []);
    const witness = input.witness;
    if (chunks.length === 2 && witness.length === 0) {
        return p2pkh({
            pubkey: chunks[1],
            network,
        }).address;
    }
    if (chunks.length === 1 && witness.length === 2) {
        return p2sh({
            redeem: p2wpkh({
                pubkey: witness[1],
                network,
            }),
        }).address;
    }
    if (chunks.length === 0 && witness.length === 2) {
        return p2wpkh({
            pubkey: witness[1],
            network,
        }).address;
    }
    if (chunks.length > 2 && witness.length === 0) {
        const redeemScript = scriptDecompile(chunks[chunks.length - 1]);
        if (!redeemScript) {
            console.error(new Error('Cannot decode address from input'));
            return undefined;
        }
        if (redeemScript[redeemScript.length - 1] === OPS.OP_CHECKMULTISIG) {
            const m = chunks.length - 2;
            const pubkeys = redeemScript.filter(n => typeof n !== 'number');
            return p2sh({
                redeem: p2ms({
                    m,
                    pubkeys,
                    network,
                }),
            }).address;
        }
        if (redeemScript[0] === OPS.OP_IF) {
            return p2sh({
                redeem: {
                    output: chunks[chunks.length - 1],
                },
                network,
            }).address;
        }
    }
    if (chunks.length === 1 && witness.length > 2) {
        const redeemScript = scriptDecompile(witness[witness.length - 1]);
        if (!redeemScript) {
            console.error(new Error('Cannot decode address from input'));
            return undefined;
        }
        if (redeemScript[redeemScript.length - 1] === OPS.OP_CHECKMULTISIG) {
            const m = witness.length - 2;
            const pubkeys = scriptDecompile(witness[witness.length - 1])
                .filter(n => typeof n !== 'number');
            return p2sh({
                redeem: p2wsh({
                    redeem: p2ms({
                        m,
                        pubkeys,
                        network,
                    }),
                }),
            }).address;
        }
        if (witness.length === 3 && redeemScript.filter(n => typeof n !== 'number').length === 1) {
            return p2sh({
                redeem: p2wsh({
                    redeem: p2pkh({
                        pubkey: witness[1],
                        network,
                    }),
                }),
            }).address;
        }
    }
    if (chunks.length === 0 && witness.length > 2) {
        const redeemScript = scriptDecompile(witness[witness.length - 1]);
        if (!redeemScript) {
            console.error(new Error('Cannot decode address from input'));
            return undefined;
        }
        if (redeemScript[redeemScript.length - 1] === OPS.OP_CHECKMULTISIG) {
            const m = witness.length - 2;
            const pubkeys = redeemScript.filter(n => typeof n !== 'number');
            return p2wsh({
                redeem: p2ms({
                    m,
                    pubkeys,
                    network,
                }),
            }).address;
        }
        if (redeemScript[0] === OPS.OP_IF) {
            return p2wsh({
                witness,
                network,
            }).address;
        }
    }
    console.error(new Error('Cannot decode address from input'));
    return undefined;
}
export function transactionFromPlain(plain) {
    const tx = new Transaction();
    tx.version = plain.version;
    tx.locktime = plain.locktime;
    tx.ins = plain.inputs.sort((a, b) => a.index - b.index).map(input => inputFromPlain(input));
    tx.outs = plain.outputs.sort((a, b) => a.index - b.index).map(output => outputFromPlain(output));
    return tx;
}
export function inputFromPlain(plain) {
    return {
        hash: Buffer.from(hexToBytes(plain.transactionHash).reverse()),
        index: plain.outputIndex,
        script: Buffer.from(hexToBytes(plain.script)),
        sequence: plain.sequence,
        witness: plain.witness.map(scriptOrNumber => typeof scriptOrNumber === 'string' ? Buffer.from(hexToBytes(scriptOrNumber)) : scriptOrNumber),
    };
}
export function outputFromPlain(plain) {
    return {
        script: Buffer.from(hexToBytes(plain.script)),
        value: plain.value,
    };
}
