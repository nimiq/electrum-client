import * as BitcoinJS from 'bitcoinjs-lib';
export var Network;
(function (Network) {
    Network["MAIN"] = "bitcoin";
    Network["TEST"] = "testnet";
})(Network || (Network = {}));
export class GenesisConfig {
    static main() {
        GenesisConfig.init(GenesisConfig.CONFIGS[Network.MAIN]);
    }
    static test() {
        GenesisConfig.init(GenesisConfig.CONFIGS[Network.TEST]);
    }
    static init(config) {
        if (GenesisConfig._config)
            throw new Error('GenesisConfig already initialized');
        if (!config.NETWORK_NAME)
            throw new Error('Config is missing network name');
        if (!config.GENESIS_HEADER)
            throw new Error('Config is missing genesis header');
        if (!config.SEED_PEERS)
            throw new Error('Config is missing seed peers');
        GenesisConfig._config = config;
    }
    static get NETWORK_NAME() {
        if (!GenesisConfig._config)
            throw new Error('GenesisConfig not initialized');
        return GenesisConfig._config.NETWORK_NAME;
    }
    static get GENESIS_HEADER() {
        if (!GenesisConfig._config)
            throw new Error('GenesisConfig not initialized');
        return GenesisConfig._config.GENESIS_HEADER;
    }
    static get GENESIS_HASH() {
        if (!GenesisConfig._config)
            throw new Error('GenesisConfig not initialized');
        if (!GenesisConfig._config.GENESIS_HASH) {
            GenesisConfig._config.GENESIS_HASH = BitcoinJS.Block.fromHex(GenesisConfig._config.GENESIS_HEADER).getId();
        }
        return GenesisConfig._config.GENESIS_HASH;
    }
    static get SEED_PEERS() {
        if (!GenesisConfig._config)
            throw new Error('GenesisConfig not initialized');
        return GenesisConfig._config.SEED_PEERS;
    }
    static get SEED_LISTS() {
        if (!GenesisConfig._config)
            throw new Error('GenesisConfig not initialized');
        return GenesisConfig._config.SEED_LISTS;
    }
}
GenesisConfig.CONFIGS = {
    'bitcoin': {
        NETWORK_NAME: Network.MAIN,
        SEED_PEERS: [
            { host: 'electrum.blockstream.info', ports: { wss: null, ssl: 50002, tcp: 50001 }, ip: '', version: '' },
            { host: 'bitcoin.aranguren.org', ports: { wss: null, ssl: 50002, tcp: 50001 }, ip: '', version: '' },
            { host: 'bitcoin.lukechilds.co', ports: { wss: null, ssl: 50002, tcp: 50001 }, ip: '', version: '' },
            { host: 'skbxmit.coinjoined.com', ports: { wss: null, ssl: 50002, tcp: 50001 }, ip: '', version: '' },
            { host: 'electrumx.ultracloud.tk', ports: { wss: null, ssl: 50002, tcp: null }, ip: '', version: '' },
            { host: 'btc.ultracloud.tk', ports: { wss: null, ssl: 50002, tcp: null }, ip: '', version: '' },
            { host: 'btc.electrum.bitbitnet.net', ports: { wss: null, ssl: 50002, tcp: 50001 }, ip: '', version: '' },
            { host: 'electrum.coinext.com.br', ports: { wss: null, ssl: 50002, tcp: 50001 }, ip: '', version: '' },
            { host: 'endthefed.onthewifi.com', ports: { wss: null, ssl: 50002, tcp: null }, ip: '', version: '' },
            { host: '2ex.digitaleveryware.com', ports: { wss: null, ssl: 50002, tcp: null }, ip: '', version: '' },
            { host: '1electrumx.hopto.me', ports: { wss: null, ssl: 50002, tcp: 50001 }, ip: '', version: '' },
            { host: 'helicarrier.bauerj.eu', ports: { wss: null, ssl: 50002, tcp: 50001 }, ip: '', version: '' },
            { host: 'node1.btccuracao.com', ports: { wss: null, ssl: 50002, tcp: 50001 }, ip: '', version: '' },
            { host: 'ultracloud.tk', ports: { wss: null, ssl: 50002, tcp: null }, ip: '', version: '' },
            { host: 'horsey.cryptocowboys.net', ports: { wss: null, ssl: 50002, tcp: 50001 }, ip: '', version: '' },
            { host: 'electrum-btc.leblancnet.us', ports: { wss: null, ssl: 50002, tcp: 50001 }, ip: '', version: '' },
            { host: 'caleb.vegas', ports: { wss: null, ssl: 50002, tcp: null }, ip: '', version: '' },
            { host: 'alviss.coinjoined.com', ports: { wss: null, ssl: 50002, tcp: 50001 }, ip: '', version: '' },
            { host: 'gall.pro', ports: { wss: null, ssl: 50002, tcp: null }, ip: '', version: '' },
            { host: 'electrum.syngularity.es', ports: { wss: null, ssl: 50002, tcp: 50001 }, ip: '', version: '' },
            { host: 'electrum2.privateservers.network', ports: { wss: null, ssl: 50002, tcp: 50001 }, ip: '', version: '' },
            { host: 'electrum.snekash.io', ports: { wss: null, ssl: 50002, tcp: null }, ip: '', version: '' },
            { host: 'stavver.dyshek.org', ports: { wss: null, ssl: 50002, tcp: 50001 }, ip: '', version: '' },
        ],
        SEED_LISTS: [],
        GENESIS_HEADER: '0100000000000000000000000000000000000000000000000000000000000000000000003ba3edfd7a7b12b27ac72c3e67768f617fc81bc3888a51323a9fb8aa4b1e5e4a29ab5f49ffff001d1dac2b7c',
    },
    'testnet': {
        NETWORK_NAME: Network.TEST,
        SEED_PEERS: [
            { host: 'electrum.blockstream.info', ports: { wss: null, ssl: 60002, tcp: 60001 }, ip: '', version: '' },
        ],
        SEED_LISTS: [],
        GENESIS_HEADER: '0100000000000000000000000000000000000000000000000000000000000000000000003ba3edfd7a7b12b27ac72c3e67768f617fc81bc3888a51323a9fb8aa4b1e5e4adae5494dffff001d1aa4ae18',
    },
};
