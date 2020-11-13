import { PlainTransaction, PlainBlockHeader } from '../electrum-api/types';
import { Handle, ConsensusChangedListener, HeadChangedListener, TransactionListener, TransactionDetails } from './types';
declare type ElectrumClientOptions = {
    requiredBlockConfirmations: number;
    websocketProxy?: {
        tcp: string | false;
        ssl: string | false;
    };
};
export declare class ElectrumClient {
    private consensusState;
    private head;
    private agents;
    private addressBook;
    private subscribedAddresses;
    private consensusChangedListeners;
    private headChangedListeners;
    private transactionListeners;
    private listenerId;
    private transactionsWaitingForConfirmation;
    private options;
    constructor(options?: Partial<ElectrumClientOptions>);
    getHeadHash(): string | undefined;
    getHeadHeight(): number | undefined;
    getHeadBlock(): PlainBlockHeader | undefined;
    getBlockAt(height: number): Promise<PlainBlockHeader>;
    getBalance(address: string): Promise<import("../electrum-api").Balance>;
    getTransaction(hash: string, block?: PlainBlockHeader): Promise<PlainTransaction>;
    getTransactionReceiptsByAddress(address: string): Promise<import("../electrum-api").Receipt[]>;
    getTransactionsByAddress(address: string, sinceBlockHeight?: number, knownTransactions?: TransactionDetails[], limit?: number): Promise<TransactionDetails[]>;
    sendTransaction(serializedTx: string): Promise<TransactionDetails>;
    estimateFees(targetBlocks?: number[]): Promise<{
        [target: number]: number | undefined;
    }>;
    getMempoolFees(): Promise<[number, number][]>;
    getMinimumRelayFee(): Promise<number>;
    addConsensusChangedListener(listener: ConsensusChangedListener): Handle;
    addHeadChangedListener(listener: HeadChangedListener): Handle;
    addTransactionListener(listener: TransactionListener, addresses: string[]): Handle;
    removeListener(handle: Handle): void;
    waitForConsensusEstablished(): Promise<unknown>;
    private connect;
    private addPeers;
    private removePeer;
    private getConfirmationHeight;
    private queueTransactionForConfirmation;
    private clearTransactionFromConfirm;
    private onConsensusChanged;
    private onConsensusFailed;
    onHeadChanged(block: PlainBlockHeader, reason: string, revertedBlocks: PlainBlockHeader[], adoptedBlocks: PlainBlockHeader[]): Promise<void>;
    private onPendingTransaction;
    private onMinedTransaction;
    private onConfirmedTransaction;
    private getListenersForTransaction;
}
export {};
