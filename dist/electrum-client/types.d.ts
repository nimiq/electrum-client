import { PlainTransaction, PlainBlockHeader } from '../electrum-api';
export declare enum ConsensusState {
    CONNECTING = "connecting",
    SYNCING = "syncing",
    ESTABLISHED = "established"
}
export declare enum TransactionState {
    NEW = "new",
    PENDING = "pending",
    MINED = "mined",
    INVALIDATED = "invalidated",
    CONFIRMED = "confirmed"
}
export declare type TransactionDetails = PlainTransaction & {
    state: TransactionState;
    blockHash?: string;
    blockHeight?: number;
    timestamp?: number;
    confirmations: number;
};
export declare type Handle = number;
export declare type ConsensusChangedListener = (consensusState: ConsensusState) => any;
export declare type HeadChangedListener = (block: PlainBlockHeader, reason: string, revertedBlocks: string[], adoptedBlocks: string[]) => any;
export declare type TransactionListener = (transaction: TransactionDetails) => any;
