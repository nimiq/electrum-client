import {
    Block,
    Network,
    Transaction,
    TxInput,
    TxOutput,
    address,
    networks,
    payments,
    script,
} from 'bitcoinjs-lib';

import {
    ElectrumWS,
    bytesToHex,
} from '../electrum-ws/index';

import {
    Balance,
    PlainBlockHeader,
    PlainInput,
    PlainOutput,
    PlainTransaction,
    Receipt,
} from './types';

export type Options = {
    endpoint?: string,
    network?: Network,
    proxy?: boolean,
    token?: string,
}

export class ElectrumApi {
    private options: Options;
    private socket: ElectrumWS;

    constructor(options: Omit<Options, 'network'> & { network?: 'bitcoin' | 'testnet' | 'regtest' | Network } = {}) {
        if (typeof options.network === 'string') {
            options.network = networks[options.network];
        }

        this.options = options as Options;

        this.socket = new ElectrumWS(this.options.endpoint, {
            proxy: this.options.proxy,
            token: this.options.token,
        });
    }

    public async getBalance(address: string): Promise<Balance> {
        return this.socket.request('blockchain.scripthash.get_balance', await this.addressToScriptHash(address));
    }

    public async getReceipts(address: string, isScriptHash = false): Promise<Receipt[]> {
        const receipts: Array<{height: number, tx_hash: string, fee?: number}> =
            await this.socket.request('blockchain.scripthash.get_history', isScriptHash ? script : await this.addressToScriptHash(address));

        return receipts.map((r) => ({
            blockHeight: r.height,
            transactionHash: r.tx_hash,
            ...(r.fee ? { fee: r.fee } : {}),
        }));
    }

    public async getHistory(address: string) {
        const history = await this.getReceipts(address);

        // TODO: Skip known receipts

        // Sort by height DESC to fetch newest txs first
        history.sort((a, b) => (b.blockHeight || Number.MAX_SAFE_INTEGER) - (a.blockHeight || Number.MAX_SAFE_INTEGER));

        const blockHeights = history.reduce((array, entry) => {
            const height = entry.blockHeight;
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
        for (const { transactionHash, blockHeight } of history) {
            try {
                const tx = await this.getTransaction(transactionHash);

                const blockHeader = blockHeaders.get(blockHeight);
                if (blockHeader) {
                    tx.blockHeight = blockHeight;
                    tx.timestamp = blockHeader.timestamp;
                    tx.blockHash = blockHeader.blockHash;
                }

                txs.push(tx);
            } catch (error) {
                console.error(error);
                return txs;
            }
        }

        return txs;
    }

    public async getTransaction(hash: string, height?: number): Promise<PlainTransaction> {
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

    public async getBlockHeader(height: number): Promise<PlainBlockHeader> {
        const raw: string = await this.socket.request('blockchain.block.header', height);

        const block = Block.fromHex(raw);

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

    async broadcastTransaction(rawTx: string): Promise<PlainTransaction> {
        const tx = this.transactionToPlain(rawTx);
        const hash = await this.socket.request('blockchain.transaction.broadcast', rawTx);
        if (hash === tx.transactionHash) return tx;
        else throw new Error(hash); // Protocol v1.0 returns errors as the result string
    }

    async subscribeReceipts(address: string, callback: (receipts: Receipt[]) => any) {
        this.socket.subscribe(
            'blockchain.scripthash',
            async (scriptHash: string, status: string) => {
                callback(await this.getReceipts(scriptHash, true));
            },
            await this.addressToScriptHash(address),
        );
    }

    async subscribeHeaders(callback: (header: PlainBlockHeader) => any) {
        this.socket.subscribe('blockchain.headers', async (headerInfo) => {
            callback(await this.getBlockHeader(headerInfo.height));
        });
    }

    transactionToPlain(tx: string | Transaction, plainHeader?: PlainBlockHeader): PlainTransaction {
        if (typeof tx === 'string') tx = Transaction.fromHex(tx);

        const plain: PlainTransaction = {
            transactionHash: tx.getId(),
            inputs: tx.ins.map((input: TxInput, index: number) => this.inputToPlain(input, index)),
            outputs: tx.outs.map((output: TxOutput, index: number) => this.outputToPlain(output, index)),
            version: tx.version,
            vsize: tx.virtualSize(),
            isCoinbase: tx.isCoinbase(),
            weight: tx.weight(),
            blockHash: null,
            blockHeight: null,
            timestamp: null,
        };

        if (plainHeader) {
            plain.blockHash = plainHeader.blockHash;
            plain.blockHeight = plainHeader.blockHeight;
            plain.timestamp = plainHeader.timestamp;
        }

        return plain;
    }

    inputToPlain(input: TxInput, index: number): PlainInput {
        return {
            script: input.script,
            transactionHash: bytesToHex(input.hash.reverse()),
            address: this.deriveAddressFromInput(input) || null,
            witness: input.witness,
            index,
            outputIndex: input.index,
        };
    }

    outputToPlain(output: TxOutput, index: number): PlainOutput {
        return {
            script: output.script,
            address: address.fromOutputScript(output.script, this.options.network),
            value: output.value,
            index,
        };
    }

    deriveAddressFromInput(input: TxInput): string | undefined {
        const chunks = (script.decompile(input.script) || []) as Buffer[];
        const witness = input.witness;

        // Legacy addresses P2PKH (1...)
        // a4453c9e224a0927f2909e49e3a97b31b5aa74a42d99de8cfcdaf293cb2ecbb7 0,1
        if (chunks.length === 2 && witness.length === 0) {
            return payments.p2pkh({
                pubkey: chunks[1],
                network: this.options.network,
            }).address;
        }

        // Nested SegWit P2SH(P2WPKH) (3...)
        // 6f4e12fa9e869c8721f2d747e042ff80f51c6757277df1563b54d4e9c9454ba0 0,1,2
        if (chunks.length === 1	&& witness.length === 2) {
            return payments.p2sh({
                redeem: payments.p2wpkh({
                    pubkey: witness[1],
                    network: this.options.network,
                }),
            }).address;
        }

        // Native SegWit P2WPKH (bc1...)
        // 3c89e220db701fed2813e0af033610044bc508d2de50cb4c420b8f3ad2d72c5c 0
        if (chunks.length === 0 && witness.length === 2) {
            return payments.p2wpkh({
                pubkey: witness[1],
                network: this.options.network,
            }).address;
        }

        // Legacy MultiSig P2SH(P2MS) (3...)
        // 80975cddebaa93aa21a6477c0d050685d6820fa1068a2731db0f39b535cbd369 0,1,2
        if (chunks.length > 2 && witness.length === 0) {
            const m = chunks.length - 2; // Number of signatures
            const pubkeys = script.decompile(chunks[chunks.length - 1])!
                .filter((n: number | Buffer) => typeof n !== 'number') as Buffer[];

            return payments.p2sh({
                redeem: payments.p2ms({
                    m,
                    pubkeys,
                    network: this.options.network,
                }),
            }).address;
        }

        // Nested SegWit MultiSig P2SH(P2WSH(P2MS)) (3...)
        // 80975cddebaa93aa21a6477c0d050685d6820fa1068a2731db0f39b535cbd369 3
        if (chunks.length === 1 && witness.length > 2) {
            const m = witness.length - 2; // Number of signatures
            const pubkeys = script.decompile(witness[witness.length - 1])!
                .filter((n: number | Uint8Array) => typeof n !== 'number') as Buffer[];

            return payments.p2sh({
                redeem: payments.p2wsh({
                    redeem: payments.p2ms({
                        m,
                        pubkeys,
                        network: this.options.network,
                    }),
                }),
            }).address;
        }

        // Native SegWit MultiSig P2WSH(P2MS) (bc1...)
        // 54a3e33efff4c508fa5c8ce7ccf4b08538a8fd2bf808b97ae51c21cf83df2dd1 0
        if (chunks.length === 0 && witness.length > 2) {
            const m = witness.length - 2; // Number of signatures
            const pubkeys = script.decompile(witness[witness.length - 1])!
                .filter((n: number | Uint8Array) => typeof n !== 'number') as Buffer[];

            return payments.p2wsh({
                redeem: payments.p2ms({
                    m,
                    pubkeys,
                    network: this.options.network,
                }),
            }).address;
        }

        console.error(new Error('Cannot decode address from input'));
        return undefined;
    }


    private async addressToScriptHash(addr: string) {
        const outputScript = address.toOutputScript(addr, this.options.network);

        // Hash with SHA256
        const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', outputScript));

        // Convert reversed into HEX
        return bytesToHex(hash.reverse());
    }
}
