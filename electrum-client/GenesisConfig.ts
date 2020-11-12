import * as BitcoinJS from 'bitcoinjs-lib';
import { Peer } from '../electrum-api';

export enum Network {
    MAIN = 'bitcoin',
    TEST = 'testnet',
}

type GenesisConfigConfig = {
    NETWORK_NAME: Network,
    SEED_PEERS: Peer[],
    SEED_LISTS: unknown[],
    GENESIS_HEADER: string,
    GENESIS_HASH?: string,
}

export class GenesisConfig {
    static main() {
        GenesisConfig.init(GenesisConfig.CONFIGS[Network.MAIN]);
    }

    static test() {
        GenesisConfig.init(GenesisConfig.CONFIGS[Network.TEST]);
    }

    static init(config: GenesisConfigConfig) {
        if (GenesisConfig._config) throw new Error('GenesisConfig already initialized');
        if (!config.NETWORK_NAME) throw new Error('Config is missing network name');
        if (!config.GENESIS_HEADER) throw new Error('Config is missing genesis header');
        if (!config.SEED_PEERS) throw new Error('Config is missing seed peers');

        GenesisConfig._config = config;
    }

    static get NETWORK_NAME() {
        if (!GenesisConfig._config) throw new Error('GenesisConfig not initialized');
        return GenesisConfig._config.NETWORK_NAME;
    }

    static get GENESIS_HEADER() {
        if (!GenesisConfig._config) throw new Error('GenesisConfig not initialized');
        return GenesisConfig._config.GENESIS_HEADER;
    }

    static get GENESIS_HASH() {
        if (!GenesisConfig._config) throw new Error('GenesisConfig not initialized');
        if (!GenesisConfig._config.GENESIS_HASH) {
            GenesisConfig._config.GENESIS_HASH = BitcoinJS.Block.fromHex(GenesisConfig._config.GENESIS_HEADER).getId();
        }
        return GenesisConfig._config.GENESIS_HASH;
    }

    static get SEED_PEERS() {
        if (!GenesisConfig._config) throw new Error('GenesisConfig not initialized');
        return GenesisConfig._config.SEED_PEERS;
    }

    static get SEED_LISTS() {
        if (!GenesisConfig._config) throw new Error('GenesisConfig not initialized');
        return GenesisConfig._config.SEED_LISTS;
    }

    private static _config: GenesisConfigConfig | undefined;

    private static readonly CONFIGS: {[name in Network]: GenesisConfigConfig} = {
        'bitcoin': {
            NETWORK_NAME: Network.MAIN,
            SEED_PEERS: [
                {host: 'electrum.blockstream.info', ports: {wss: null, ssl: 50002, tcp: 50001}, ip: '', version: ''},
                {host: 'btccore-main.bdnodes.net', ports: {wss: null, ssl: 50002, tcp: null}, ip: '', version: ''},
            ],
            SEED_LISTS: [
                // new SeedListUrl('https://nimiq.community/seeds.txt', '8b4ae04557f490102036ce3e570b39058c92fc5669083fb9bbb6effc91dc3c71')
            ],
            GENESIS_HEADER: '0100000000000000000000000000000000000000000000000000000000000000000000003ba3edfd7a7b12b27ac72c3e67768f617fc81bc3888a51323a9fb8aa4b1e5e4a29ab5f49ffff001d1dac2b7c',
        },
        'testnet': {
            NETWORK_NAME: Network.TEST,
            SEED_PEERS: [
                {host: 'electrum.blockstream.info', ports: {wss: null, ssl: 60002, tcp: 60001}, ip: '', version: ''},
            ],
            SEED_LISTS: [],
            GENESIS_HEADER: '0100000000000000000000000000000000000000000000000000000000000000000000003ba3edfd7a7b12b27ac72c3e67768f617fc81bc3888a51323a9fb8aa4b1e5e4adae5494dffff001d1aa4ae18',
        },
    }
}
