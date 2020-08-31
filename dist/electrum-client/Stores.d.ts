import { PlainTransaction, PlainBlockHeader } from '../electrum-api/types';
export declare const TransactionStore: Map<string, PlainTransaction>;
export declare const BlockStore: Map<number, PlainBlockHeader>;
