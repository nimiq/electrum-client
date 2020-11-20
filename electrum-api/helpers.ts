import * as BitcoinJS from 'bitcoinjs-lib';
import { Buffer } from 'buffer';

import { PlainTransaction, PlainBlockHeader, PlainInput, PlainOutput } from './types';
import { bytesToHex, hexToBytes } from '../electrum-ws';

export function blockHeaderToPlain(header: string | BitcoinJS.Block, height: number): PlainBlockHeader {
    if (typeof header === 'string') header = BitcoinJS.Block.fromHex(header);

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

export function transactionToPlain(tx: string | BitcoinJS.Transaction, network: BitcoinJS.Network): PlainTransaction {
    if (typeof tx === 'string') tx = BitcoinJS.Transaction.fromHex(tx);

    const inputs = tx.ins.map((input: BitcoinJS.TxInput, index: number) => inputToPlain(input, index, network));
    const outputs = tx.outs.map((output: BitcoinJS.TxOutput, index: number) => outputToPlain(output, index, network));

    const plain: PlainTransaction = {
        transactionHash: tx.getId(),
        inputs,
        outputs,
        version: tx.version,
        vsize: tx.virtualSize(),
        isCoinbase: tx.isCoinbase(),
        weight: tx.weight(),
        locktime: tx.locktime,
        // Sequence constant from https://github.com/bitcoin/bips/blob/master/bip-0125.mediawiki#summary
        replaceByFee: inputs.some(input => input.sequence < 0xfffffffe),
    };

    return plain;
}

export function inputToPlain(input: BitcoinJS.TxInput, index: number, network: BitcoinJS.Network): PlainInput {
    let address: string | null = null;

    try {
        address = deriveAddressFromInput(input, network) || null;
    } catch (error) {
        if (location.hostname === 'localhost') console.error(error);
    }

    return {
        script: bytesToHex(input.script),
        transactionHash: bytesToHex(new Uint8Array(input.hash).reverse()),
        address,
        witness: input.witness.map((buf) => {
            if (typeof buf === 'number') return buf;
            return bytesToHex(buf);
        }),
        index,
        outputIndex: input.index,
        sequence: input.sequence,
    };
}

export function outputToPlain(output: BitcoinJS.TxOutput, index: number, network: BitcoinJS.Network): PlainOutput {
    let address: string | null = null;
    try {
        // Outputs can be OP_RETURN, which does not translate to an address
        address = BitcoinJS.address.fromOutputScript(output.script, network);
    } catch (error) {
        // Ignore
    }

    return {
        script: bytesToHex(output.script),
        address,
        value: output.value,
        index,
    };
}

export function deriveAddressFromInput(input: BitcoinJS.TxInput, network: BitcoinJS.Network): string | undefined {
    if (BitcoinJS.Transaction.isCoinbaseHash(input.hash)) return undefined;

    const chunks = (BitcoinJS.script.decompile(input.script) || []) as Buffer[];
    const witness = input.witness;

    // Legacy addresses P2PKH (1...)
    // a4453c9e224a0927f2909e49e3a97b31b5aa74a42d99de8cfcdaf293cb2ecbb7 0,1
    if (chunks.length === 2 && witness.length === 0) {
        return BitcoinJS.payments.p2pkh({
            pubkey: chunks[1],
            network,
        }).address;
    }

    // Nested SegWit P2SH(P2WPKH) (3...)
    // 6f4e12fa9e869c8721f2d747e042ff80f51c6757277df1563b54d4e9c9454ba0 0,1,2
    if (chunks.length === 1	&& witness.length === 2) {
        return BitcoinJS.payments.p2sh({
            redeem: BitcoinJS.payments.p2wpkh({
                pubkey: witness[1],
                network,
            }),
        }).address;
    }

    // Native SegWit P2WPKH (bc1...)
    // 3c89e220db701fed2813e0af033610044bc508d2de50cb4c420b8f3ad2d72c5c 0
    if (chunks.length === 0 && witness.length === 2) {
        return BitcoinJS.payments.p2wpkh({
            pubkey: witness[1],
            network,
        }).address;
    }

    // Legacy Scripts (3...)
    if (chunks.length > 2 && witness.length === 0) {
        const redeemScript = BitcoinJS.script.decompile(chunks[chunks.length - 1]);
        if (!redeemScript) {
            console.error(new Error('Cannot decode address from input'));
            return undefined;
        }

        // MultiSig P2SH(P2MS)
        // 80975cddebaa93aa21a6477c0d050685d6820fa1068a2731db0f39b535cbd369 0,1,2
        if (redeemScript[redeemScript.length - 1] === BitcoinJS.script.OPS.OP_CHECKMULTISIG) {
            const m = chunks.length - 2; // Number of signatures
            const pubkeys = redeemScript.filter((n: number | Buffer) => typeof n !== 'number') as Buffer[];

            return BitcoinJS.payments.p2sh({
                redeem: BitcoinJS.payments.p2ms({
                    m,
                    pubkeys,
                    network,
                }),
            }).address;
        }

        // HTLC Redeem P2SH
        if (redeemScript[0] === BitcoinJS.script.OPS.OP_IF) {
            return BitcoinJS.payments.p2sh({
                redeem: {
                    output: chunks[chunks.length - 1],
                },
                network,
            }).address;
        }
    }

    // Nested SegWit MultiSig P2SH(P2WSH(P2MS)) (3...)
    // 80975cddebaa93aa21a6477c0d050685d6820fa1068a2731db0f39b535cbd369 3
    if (chunks.length === 1 && witness.length > 2) {
        const m = witness.length - 2; // Number of signatures
        const pubkeys = BitcoinJS.script.decompile(witness[witness.length - 1])!
            .filter((n: number | Uint8Array) => typeof n !== 'number') as Buffer[];

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

    // Native SegWit Scripts (bc1...)
    if (chunks.length === 0 && witness.length > 2) {
        const redeemScript = BitcoinJS.script.decompile(witness[witness.length - 1]);
        if (!redeemScript) {
            console.error(new Error('Cannot decode address from input'));
            return undefined;
        }

        // MultiSig P2WSH(P2MS)
        // 54a3e33efff4c508fa5c8ce7ccf4b08538a8fd2bf808b97ae51c21cf83df2dd1 0
        if (redeemScript[redeemScript.length - 1] === BitcoinJS.script.OPS.OP_CHECKMULTISIG) {
            const m = witness.length - 2; // Number of signatures
            const pubkeys = redeemScript.filter((n: number | Uint8Array) => typeof n !== 'number') as Buffer[];

            return BitcoinJS.payments.p2wsh({
                redeem: BitcoinJS.payments.p2ms({
                    m,
                    pubkeys,
                    network,
                }),
            }).address;
        }

        // HTLC Redeem P2WSH
        // 5800c704f139e388d4146be7110294470c8c17b34488544863a535d2346a4637 0
        if (redeemScript[0] === BitcoinJS.script.OPS.OP_IF) {
            return BitcoinJS.payments.p2wsh({
                witness,
                network,
            }).address
        }
    }

    console.error(new Error('Cannot decode address from input'));
    return undefined;
}

export function transactionFromPlain(plain: PlainTransaction): BitcoinJS.Transaction {
    const tx = new BitcoinJS.Transaction();
    tx.version = plain.version;
    tx.locktime = plain.locktime;
    tx.ins = plain.inputs.sort((a, b) => a.index - b.index).map(input => inputFromPlain(input));
    tx.outs = plain.outputs.sort((a, b) => a.index - b.index).map(output => outputFromPlain(output));
    return tx;
}

export function inputFromPlain(plain: PlainInput): BitcoinJS.TxInput {
    return {
        hash: Buffer.from(hexToBytes(plain.transactionHash).reverse()),
        index: plain.outputIndex,
        script: Buffer.from(hexToBytes(plain.script)),
        sequence: plain.sequence,
        witness: plain.witness.map(scriptOrNumber => typeof scriptOrNumber === 'string' ? Buffer.from(hexToBytes(scriptOrNumber)) : scriptOrNumber as any as Buffer),
    };
}

export function outputFromPlain(plain: PlainOutput): BitcoinJS.TxOutput {
    return {
        script: Buffer.from(hexToBytes(plain.script)),
        value: plain.value,
    };
}
