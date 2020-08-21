import * as BitcoinJS from 'bitcoinjs-lib';
import { Balance, PlainBlockHeader, PlainInput, PlainOutput, PlainTransaction, Receipt, Peer } from './types';
export declare type ElectrumApiOptions = {
    endpoint?: string;
    network?: BitcoinJS.Network;
    proxy?: boolean;
    token?: string;
    reconnect?: boolean;
};
export declare class ElectrumApi {
    private options;
    private socket;
    constructor(options?: Omit<ElectrumApiOptions, 'network'> & {
        network?: 'bitcoin' | 'testnet' | 'regtest' | BitcoinJS.Network;
    });
    getBalance(address: string): Promise<Balance>;
    getReceipts(address: string, isScriptHash?: boolean): Promise<Receipt[]>;
    getHistory(address: string, sinceBlockHeight?: number, knownReceipts?: Receipt[], limit?: number): Promise<PlainTransaction[]>;
    getTransaction(hash: string, heightOrBlockHeader?: number | PlainBlockHeader): Promise<PlainTransaction>;
    getTransactionMerkleRoot(hash: string, height: number): Promise<string>;
    getBlockHeader(height: number): Promise<PlainBlockHeader>;
    getFeeHistogram(): Promise<Array<[number, number]>>;
    broadcastTransaction(rawTx: string): Promise<PlainTransaction>;
    subscribeReceipts(address: string, callback: (receipts: Receipt[]) => any): Promise<void>;
    subscribeHeaders(callback: (header: PlainBlockHeader) => any): Promise<void>;
    getPeers(): Promise<Peer[]>;
    transactionToPlain(tx: string | BitcoinJS.Transaction, plainHeader?: PlainBlockHeader): PlainTransaction;
    inputToPlain(input: BitcoinJS.TxInput, index: number): PlainInput;
    outputToPlain(output: BitcoinJS.TxOutput, index: number): PlainOutput;
    deriveAddressFromInput(input: BitcoinJS.TxInput): string | undefined;
    blockHeaderToPlain(header: string | BitcoinJS.Block, height: number): PlainBlockHeader;
    private addressToScriptHash;
}
