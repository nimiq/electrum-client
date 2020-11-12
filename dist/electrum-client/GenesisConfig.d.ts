import { Peer } from '../electrum-api';
export declare enum Network {
    MAIN = "bitcoin",
    TEST = "testnet"
}
declare type GenesisConfigConfig = {
    NETWORK_NAME: Network;
    SEED_PEERS: Peer[];
    SEED_LISTS: unknown[];
    GENESIS_HEADER: string;
    GENESIS_HASH?: string;
};
export declare class GenesisConfig {
    static main(): void;
    static test(): void;
    static init(config: GenesisConfigConfig): void;
    static get NETWORK_NAME(): Network;
    static get GENESIS_HEADER(): string;
    static get GENESIS_HASH(): string;
    static get SEED_PEERS(): Peer[];
    static get SEED_LISTS(): unknown[];
    private static _config;
    private static readonly CONFIGS;
}
export {};
