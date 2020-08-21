import * as BitcoinJS from 'bitcoinjs-lib';
import { ElectrumWS, bytesToHex, hexToBytes, } from '../electrum-ws/index';
export class ElectrumApi {
    constructor(options = {}) {
        if (typeof options.network === 'string') {
            options.network = BitcoinJS.networks[options.network];
        }
        this.options = options;
        const wsOptions = {};
        if ('proxy' in this.options)
            wsOptions.proxy = this.options.proxy;
        if ('token' in this.options)
            wsOptions.token = this.options.token;
        if ('reconnect' in this.options)
            wsOptions.reconnect = this.options.reconnect;
        this.socket = new ElectrumWS(this.options.endpoint, wsOptions);
    }
    async getBalance(address) {
        return this.socket.request('blockchain.scripthash.get_balance', await this.addressToScriptHash(address));
    }
    async getReceipts(address, isScriptHash = false) {
        const receipts = await this.socket.request('blockchain.scripthash.get_history', isScriptHash ? address : await this.addressToScriptHash(address));
        return receipts.map((r) => ({
            blockHeight: r.height,
            transactionHash: r.tx_hash,
            ...(r.fee ? { fee: r.fee } : {}),
        }));
    }
    async getHistory(address, sinceBlockHeight = 0, knownReceipts = [], limit = Infinity) {
        const knownTxs = new Map();
        if (knownReceipts) {
            for (const receipt of knownReceipts) {
                knownTxs.set(receipt.transactionHash, receipt);
            }
        }
        let history = await this.getReceipts(address);
        history.sort((a, b) => (b.blockHeight || Number.MAX_SAFE_INTEGER) - (a.blockHeight || Number.MAX_SAFE_INTEGER));
        if (limit < Infinity) {
            history = history.slice(0, limit);
        }
        if (sinceBlockHeight > 0) {
            const firstUnwantedHistoryIndex = history.findIndex(receipt => receipt.blockHeight > 0 && receipt.blockHeight < sinceBlockHeight);
            history = history.slice(0, firstUnwantedHistoryIndex);
        }
        const blockHeaders = new Map();
        const txs = [];
        for (const { transactionHash, blockHeight } of history) {
            const knownTx = knownTxs.get(transactionHash);
            if (knownTx && knownTx.blockHeight === Math.max(blockHeight, 0))
                continue;
            try {
                let blockHeader = blockHeaders.get(blockHeight);
                if (!blockHeader && blockHeight > 0) {
                    blockHeader = await this.getBlockHeader(blockHeight);
                    blockHeaders.set(blockHeight, blockHeader);
                }
                try {
                    const tx = await this.getTransaction(transactionHash, blockHeader);
                    txs.push(tx);
                }
                catch (error) {
                    console.warn(error);
                    continue;
                }
            }
            catch (error) {
                console.warn(error);
                return txs;
            }
        }
        return txs;
    }
    async getTransaction(hash, heightOrBlockHeader) {
        let blockHeader;
        if (typeof heightOrBlockHeader === 'object') {
            blockHeader = heightOrBlockHeader;
        }
        else if (typeof heightOrBlockHeader === 'number' && heightOrBlockHeader > 0) {
            blockHeader = await this.getBlockHeader(heightOrBlockHeader);
        }
        if (blockHeader) {
            const transactionMerkleRoot = await this.getTransactionMerkleRoot(hash, blockHeader.blockHeight);
            if (transactionMerkleRoot !== blockHeader.merkleRoot) {
                throw new Error(`Invalid merkle proof for given block height: ${hash}, ${blockHeader.blockHeight}`);
            }
        }
        const raw = await this.socket.request('blockchain.transaction.get', hash);
        return this.transactionToPlain(raw, blockHeader);
    }
    async getTransactionMerkleRoot(hash, height) {
        const proof = await this.socket.request('blockchain.transaction.get_merkle', hash, height);
        let i = proof.pos;
        let node = hexToBytes(hash).reverse();
        for (const pairHash of proof.merkle) {
            const pairNode = hexToBytes(pairHash).reverse();
            const concatenated = new Uint8Array(i % 2 === 0
                ? [...node, ...pairNode]
                : [...pairNode, ...node]);
            node = new Uint8Array(await crypto.subtle.digest('SHA-256', await crypto.subtle.digest('SHA-256', concatenated)));
            i = Math.floor(i / 2);
        }
        return bytesToHex(node.reverse());
    }
    async getBlockHeader(height) {
        const raw = await this.socket.request('blockchain.block.header', height);
        return this.blockHeaderToPlain(raw, height);
    }
    async getFeeHistogram() {
        return this.socket.request('mempool.get_fee_histogram');
    }
    async broadcastTransaction(rawTx) {
        const tx = this.transactionToPlain(rawTx);
        const hash = await this.socket.request('blockchain.transaction.broadcast', rawTx);
        if (hash === tx.transactionHash)
            return tx;
        else
            throw new Error(hash);
    }
    async subscribeReceipts(address, callback) {
        this.socket.subscribe('blockchain.scripthash', async (scriptHash, status) => {
            callback(!status ? [] : await this.getReceipts(scriptHash, true));
        }, await this.addressToScriptHash(address));
    }
    async subscribeHeaders(callback) {
        this.socket.subscribe('blockchain.headers', async (headerInfo) => {
            callback(this.blockHeaderToPlain(headerInfo.hex, headerInfo.height));
        });
    }
    async getPeers() {
        const peers = await this.socket.request('server.peers.subscribe');
        return peers.map(peer => {
            const ip = peer[0];
            const host = peer[1];
            let version = '';
            let pruningLimit = undefined;
            let tcp = null;
            let ssl = null;
            for (const meta of peer[2]) {
                switch (meta.charAt(0)) {
                    case 'v':
                        version = meta.substring(1);
                        break;
                    case 'p':
                        pruningLimit = Number.parseInt(meta.substring(1), 10);
                        break;
                    case 't':
                        {
                            if (meta.substring(1).length === 0) {
                                switch (this.options.network || BitcoinJS.networks.bitcoin) {
                                    case BitcoinJS.networks.testnet:
                                        tcp = 60001;
                                        break;
                                    default:
                                        tcp = 50001;
                                        break;
                                }
                            }
                            else {
                                tcp = Number.parseInt(meta.substring(1), 10);
                            }
                        }
                        break;
                    case 's':
                        {
                            if (meta.substring(1).length === 0) {
                                switch (this.options.network || BitcoinJS.networks.bitcoin) {
                                    case BitcoinJS.networks.testnet:
                                        ssl = 60002;
                                        break;
                                    default:
                                        ssl = 50002;
                                        break;
                                }
                            }
                            else {
                                ssl = Number.parseInt(meta.substring(1), 10);
                            }
                        }
                        break;
                }
            }
            return {
                ip,
                host,
                version,
                pruningLimit,
                ports: {
                    tcp,
                    ssl,
                },
            };
        });
    }
    transactionToPlain(tx, plainHeader) {
        if (typeof tx === 'string')
            tx = BitcoinJS.Transaction.fromHex(tx);
        const inputs = tx.ins.map((input, index) => this.inputToPlain(input, index));
        const outputs = tx.outs.map((output, index) => this.outputToPlain(output, index));
        const plain = {
            transactionHash: tx.getId(),
            inputs,
            outputs,
            version: tx.version,
            vsize: tx.virtualSize(),
            isCoinbase: tx.isCoinbase(),
            weight: tx.weight(),
            blockHash: null,
            blockHeight: null,
            timestamp: null,
            replaceByFee: inputs.some(input => input.sequence < 0xfffffffe),
        };
        if (plainHeader) {
            plain.blockHash = plainHeader.blockHash;
            plain.blockHeight = plainHeader.blockHeight;
            plain.timestamp = plainHeader.timestamp;
        }
        return plain;
    }
    inputToPlain(input, index) {
        return {
            script: bytesToHex(input.script),
            transactionHash: bytesToHex(new Uint8Array(input.hash).reverse()),
            address: this.deriveAddressFromInput(input) || null,
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
    outputToPlain(output, index) {
        return {
            script: bytesToHex(output.script),
            address: BitcoinJS.address.fromOutputScript(output.script, this.options.network),
            value: output.value,
            index,
        };
    }
    deriveAddressFromInput(input) {
        const chunks = (BitcoinJS.script.decompile(input.script) || []);
        const witness = input.witness;
        if (chunks.length === 2 && witness.length === 0) {
            return BitcoinJS.payments.p2pkh({
                pubkey: chunks[1],
                network: this.options.network,
            }).address;
        }
        if (chunks.length === 1 && witness.length === 2) {
            return BitcoinJS.payments.p2sh({
                redeem: BitcoinJS.payments.p2wpkh({
                    pubkey: witness[1],
                    network: this.options.network,
                }),
            }).address;
        }
        if (chunks.length === 0 && witness.length === 2) {
            return BitcoinJS.payments.p2wpkh({
                pubkey: witness[1],
                network: this.options.network,
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
                    network: this.options.network,
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
                        network: this.options.network,
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
                    network: this.options.network,
                }),
            }).address;
        }
        console.error(new Error('Cannot decode address from input'));
        return undefined;
    }
    blockHeaderToPlain(header, height) {
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
    async addressToScriptHash(addr) {
        const outputScript = BitcoinJS.address.toOutputScript(addr, this.options.network);
        const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', outputScript));
        return bytesToHex(hash.reverse());
    }
}
