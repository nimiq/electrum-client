import * as BitcoinJS from 'bitcoinjs-lib';

import { ElectrumWS, bytesToHex, hexToBytes } from '../electrum-ws/index';

export type Balance = {
    confirmed: number,
    unconfirmed: number,
}

export type Receipt = {
    height: number,
    tx_hash: string
}

export type PlainInput = {
    script: Uint8Array,
    txid: string,
    address: string,
    witness: Array<number | Uint8Array>,
    index: number,
    output_index: number,
}

export type PlainOutput = {
    script: Uint8Array,
    address: string,
    value: number,
    index: number,
}

export type PlainTransaction = {
    txid: string,
    inputs: PlainInput[],
    outputs: PlainOutput[],
    version: number,
    vsize: number,
    isCoinbase: boolean,
    weight: number,
    block_hash: string | null,
    block_height: number | null,
    block_time: number | null,
}

export type PlainBlockHeader = {
    blockHash: string,
    blockHeight: number,
    timestamp: number,
    bits: number,
    nonce: number,
    version: number,
    weight: number,
    prevHash: string | null,
    merkleRoot: string | null,
}

export async function scriptPubKeyToScriptHash(scriptPubKey: string | Uint8Array) {
    if (typeof scriptPubKey === 'string') {
        // From HEX to bytes
        scriptPubKey = hexToBytes(scriptPubKey);
    }

    // Hash with SHA256
    const hash = new Uint8Array(await window.crypto.subtle.digest('SHA-256', scriptPubKey));

    // Reverse bytes
    const reversed = new Uint8Array(Array.from(hash).reverse());

    // Convert into HEX
    return bytesToHex(reversed);
}

export class ElectrumApi {
    public static network = BitcoinJS.networks.testnet;

    public static socket = new ElectrumWS(undefined, {
        proxy: true,
        token: 'testnet',
    });

    public static async getBalance(script: string | Uint8Array): Promise<Balance> {
        return this.socket.request('blockchain.scripthash.get_balance', await scriptPubKeyToScriptHash(script));
    }

    public static async getReceipts(script: string | Uint8Array, isScriptHash = false): Promise<Receipt[]> {
        return this.socket.request('blockchain.scripthash.get_history', isScriptHash ? script : await scriptPubKeyToScriptHash(script));
    }

    public static async getHistory(script: string | Uint8Array) {
        const history = await this.getReceipts(script);

        // TODO: Skip known receipts

        // Sort by height DESC to fetch newest txs first
        history.sort((a, b) => (b.height || Number.MAX_SAFE_INTEGER) - (a.height || Number.MAX_SAFE_INTEGER));

        const blockHeights = history.reduce((array, entry) => {
            const height = entry.height;
            if (height > 0) array.push(height);
            return array;
        }, [] as number[]);

        const blockHeaders = new Map<number, PlainBlockHeader>();

        // Fetch block headers
        for (const height of blockHeights) {
            try {
                blockHeaders.set(height, await this.getBlockHeader(height));
            } catch (error) {
                console.error(error);
                break;
            }
        }

        // Fetch transactions
        const txs = [];
        for (const { tx_hash, height } of history) {
            try {
                const tx = await this.getTransaction(tx_hash);

                const blockHeader = blockHeaders.get(height);
                if (blockHeader) {
                    tx.block_height = height;
                    tx.block_time = blockHeader.timestamp;
                    tx.block_hash = blockHeader.blockHash;
                }

                txs.push(tx);
            } catch (error) {
                console.error(error);
                return txs;
            }
        }

        return txs;
    }

    public static async getBlockHeader(height: number): Promise<PlainBlockHeader> {
        const raw: string = await this.socket.request('blockchain.block.header', height);

        const block = BitcoinJS.Block.fromHex(raw);

        return {
            blockHash: block.getId(),
            blockHeight: height,
            timestamp: block.timestamp,
            bits: block.bits,
            nonce: block.nonce,
            version: block.version,
            weight: block.weight(),
            prevHash: block.prevHash ? bytesToHex(block.prevHash.reverse()) : null,
            merkleRoot: block.merkleRoot ? bytesToHex(block.merkleRoot) : null,
        };
    }

    public static async getTransaction(hash: string, height?: number): Promise<PlainTransaction> {
        const raw: string = await this.socket.request('blockchain.transaction.get', hash);

        let blockHeader;
        if (typeof height === 'number' && height > 0) {
            try {
                blockHeader = await this.getBlockHeader(height);
            } catch (error) {
                console.error(error);
            }
        }

        return this.transactionToPlain(raw, blockHeader);
    }

    static async subscribeStatus(script: string | Uint8Array, callback: (receipts: Receipt[]) => any) {
        this.socket.subscribe(
            'blockchain.scripthash',
            async (scriptHash: string, status: string) => {
                callback(await this.getReceipts(scriptHash, true));
            },
            await scriptPubKeyToScriptHash(script),
        );
    }

    static async subscribeHeaders(callback: (header: PlainBlockHeader) => any) {
        this.socket.subscribe('blockchain.headers', async (headerInfo) => {
            callback(await this.getBlockHeader(headerInfo.height));
        });
    }

    static async broadcastTransaction(rawTx: string): Promise<PlainTransaction> {
        const tx = this.transactionToPlain(rawTx);
        const hash = await this.socket.request('blockchain.transaction.broadcast', rawTx);
        if (hash === tx.txid) return tx;
        else throw new Error(hash); // Protocol v1.0 returns errors as the result string
    }

    static transactionToPlain(tx: string | BitcoinJS.Transaction, plainHeader?: PlainBlockHeader): PlainTransaction {
        if (typeof tx === 'string') tx = BitcoinJS.Transaction.fromHex(tx);

        const plain: PlainTransaction = {
            txid: tx.getId(),
            inputs: tx.ins.map((input: BitcoinJS.TxInput, index: number) => this.inputToPlain(input, index)),
            outputs: tx.outs.map((output: BitcoinJS.TxOutput, index: number) => this.outputToPlain(output, index)),
            version: tx.version,
            vsize: tx.virtualSize(),
            isCoinbase: tx.isCoinbase(),
            weight: tx.weight(),
            block_hash: null,
            block_height: null,
            block_time: null,
        };

        if (plainHeader) {
            plain.block_hash = plainHeader.blockHash;
            plain.block_height = plainHeader.blockHeight;
            plain.block_time = plainHeader.timestamp;
        }

        return plain;
    }

    static inputToPlain(input: BitcoinJS.TxInput, index: number): PlainInput {
        return {
            script: input.script,
            txid: bytesToHex(input.hash.reverse()),
            address: this.deriveAddressFromInput(input),
            witness: input.witness,
            index,
            output_index: input.index,
        };
    }

    static outputToPlain(output: BitcoinJS.TxOutput, index: number): PlainOutput {
        return {
            script: output.script,
            address: BitcoinJS.address.fromOutputScript(output.script, this.network),
            value: output.value,
            index,
        };
    }

    static deriveAddressFromInput(input: BitcoinJS.TxInput): string {
        const chunks = (BitcoinJS.script.decompile(input.script) || []) as Buffer[];
        const witness = input.witness;

        // Legacy addresses P2PKH (1...)
        // a4453c9e224a0927f2909e49e3a97b31b5aa74a42d99de8cfcdaf293cb2ecbb7 0,1
        if (chunks.length === 2 && witness.length === 0) {
            return BitcoinJS.payments.p2pkh({
                pubkey: chunks[1],
                network: this.network,
            }).address!;
        }

        // Nested SegWit P2SH(P2WPKH) (3...)
        // 6f4e12fa9e869c8721f2d747e042ff80f51c6757277df1563b54d4e9c9454ba0 0,1,2
        if (chunks.length === 1	&& witness.length === 2) {
            return BitcoinJS.payments.p2sh({
                redeem: BitcoinJS.payments.p2wpkh({
                    pubkey: witness[1],
                    network: this.network,
                }),
            }).address!;
        }

        // Native SegWit P2WPKH (bc1...)
        // 3c89e220db701fed2813e0af033610044bc508d2de50cb4c420b8f3ad2d72c5c 0
        if (chunks.length === 0 && witness.length === 2) {
            return BitcoinJS.payments.p2wpkh({
                pubkey: witness[1],
                network: this.network,
            }).address!;
        }

        // Legacy MultiSig P2SH(P2MS) (3...)
        // 80975cddebaa93aa21a6477c0d050685d6820fa1068a2731db0f39b535cbd369 0,1,2
        if (chunks.length > 2 && witness.length === 0) {
            const m = chunks.length - 2; // Number of signatures
            const pubkeys = BitcoinJS.script.decompile(chunks[chunks.length - 1])!
                .filter((n: number | Buffer) => typeof n !== 'number') as Buffer[];

            return BitcoinJS.payments.p2sh({
                redeem: BitcoinJS.payments.p2ms({
                    m,
                    pubkeys,
                    network: this.network,
                }),
            }).address!;
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
                        network: this.network,
                    }),
                }),
            }).address!;
        }

        // Native SegWit MultiSig P2WSH(P2MS) (bc1...)
        // 54a3e33efff4c508fa5c8ce7ccf4b08538a8fd2bf808b97ae51c21cf83df2dd1 0
        if (chunks.length === 0 && witness.length > 2) {
            const m = witness.length - 2; // Number of signatures
            const pubkeys = BitcoinJS.script.decompile(witness[witness.length - 1])!
                .filter((n: number | Uint8Array) => typeof n !== 'number') as Buffer[];

            return BitcoinJS.payments.p2wsh({
                redeem: BitcoinJS.payments.p2ms({
                    m,
                    pubkeys,
                    network: this.network,
                }),
            }).address!;
        }

        console.error(new Error('Cannot decode address from input'));
        return '-unknown-';
    }
}
