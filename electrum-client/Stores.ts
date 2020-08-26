import { PlainTransaction, PlainBlockHeader } from '../electrum-api/types';

export const TransactionStore = new Map<string, PlainTransaction>();
export const BlockStore = new Map<number, PlainBlockHeader>();
