import { PlainTransaction, PlainBlockHeader } from '../electrum-api';

export enum ConsensusState {
    CONNECTING = 'connecting',
    SYNCING = 'syncing',
    ESTABLISHED = 'established',
}

export enum TransactionState {
    NEW = 'new',
    PENDING = 'pending',
    MINED = 'mined',
    INVALIDATED = 'invalidated',
    CONFIRMED = 'confirmed',
}

export type TransactionDetails = PlainTransaction & {
    state: TransactionState,
    blockHash?: string,
    blockHeight?: number,
    timestamp?: number,
    confirmations: number,
}

export type Handle = number;
export type ConsensusChangedListener = (consensusState: ConsensusState) => any;
export type HeadChangedListener = (block: PlainBlockHeader, reason: string, revertedBlocks: string[], adoptedBlocks: string[]) => any;
export type TransactionListener = (transaction: TransactionDetails) => any;
