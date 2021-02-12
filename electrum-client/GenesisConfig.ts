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
                {host: 'bitcoin.aranguren.org', ports: {wss: null, ssl: 50002, tcp: 50001}, ip: '', version: ''},
                {host: 'bitcoin.lukechilds.co', ports: {wss: null, ssl: 50002, tcp: 50001}, ip: '', version: ''},
                {host: 'skbxmit.coinjoined.com', ports: {wss: null, ssl: 50002, tcp: 50001}, ip: '', version: ''},
                {host: 'electrumx.ultracloud.tk', ports: {wss: null, ssl: 50002, tcp: null}, ip: '', version: ''},
                {host: 'btc.ultracloud.tk', ports: {wss: null, ssl: 50002, tcp: null}, ip: '', version: ''},
                {host: 'btc.electrum.bitbitnet.net', ports: {wss: null, ssl: 50002, tcp: 50001}, ip: '', version: ''},
                {host: 'electrum.coinext.com.br', ports: {wss: null, ssl: 50002, tcp: 50001}, ip: '', version: ''},
                {host: 'endthefed.onthewifi.com', ports: {wss: null, ssl: 50002, tcp: null}, ip: '', version: ''},
                {host: '2ex.digitaleveryware.com', ports: {wss: null, ssl: 50002, tcp: null}, ip: '', version: ''},
                {host: '1electrumx.hopto.me', ports: {wss: null, ssl: 50002, tcp: 50001}, ip: '', version: ''},
                {host: 'helicarrier.bauerj.eu', ports: {wss: null, ssl: 50002, tcp: 50001}, ip: '', version: ''},
                {host: 'node1.btccuracao.com', ports: {wss: null, ssl: 50002, tcp: 50001}, ip: '', version: ''},
                {host: 'ultracloud.tk', ports: {wss: null, ssl: 50002, tcp: null}, ip: '', version: ''},
                {host: 'horsey.cryptocowboys.net', ports: {wss: null, ssl: 50002, tcp: 50001}, ip: '', version: ''},
                {host: 'electrum-btc.leblancnet.us', ports: {wss: null, ssl: 50002, tcp: 50001}, ip: '', version: ''},
                {host: 'caleb.vegas', ports: {wss: null, ssl: 50002, tcp: null}, ip: '', version: ''},
                {host: 'alviss.coinjoined.com', ports: {wss: null, ssl: 50002, tcp: 50001}, ip: '', version: ''},
                {host: 'gall.pro', ports: {wss: null, ssl: 50002, tcp: null}, ip: '', version: ''},
                {host: 'electrum.syngularity.es', ports: {wss: null, ssl: 50002, tcp: 50001}, ip: '', version: ''},
                {host: 'electrum2.privateservers.network', ports: {wss: null, ssl: 50002, tcp: 50001}, ip: '', version: ''},
                {host: 'electrum.snekash.io', ports: {wss: null, ssl: 50002, tcp: null}, ip: '', version: ''},
                {host: 'stavver.dyshek.org', ports: {wss: null, ssl: 50002, tcp: 50001}, ip: '', version: ''},
                {host: '81-7-10-251.blue.kundencontroller.de', ports: { wss: null, ssl: 50002, tcp: null, }, ip: '', version: '1.4'},
                {host: 'E-X.not.fyi', ports: { wss: null, ssl: 50002, tcp: 50001, }, ip: '', version: '1.4'},
                {host: 'VPS.hsmiths.com', ports: { wss: null, ssl: 50002, tcp: 50001, }, ip: '', version: '1.4'},
                {host: 'b.ooze.cc', ports: { wss: null, ssl: 50002, tcp: 50001, }, ip: '', version: '1.4'},
                {host: 'bitcoin.corgi.party', ports: { wss: null, ssl: 50002, tcp: 50001, }, ip: '', version: '1.4'},
                {host: 'bitcoins.sk', ports: { wss: null, ssl: 50002, tcp: 50001, }, ip: '', version: '1.4'},
                {host: 'btc.cihar.com', ports: { wss: null, ssl: 50002, tcp: 50001, }, ip: '', version: '1.4'},
                {host: 'btc.xskyx.net', ports: { wss: null, ssl: 50002, tcp: 50001, }, ip: '', version: '1.4'},
                {host: 'electrum.jochen-hoenicke.de', ports: { wss: null, ssl: 50005, tcp: 50003, }, ip: '', version: '1.4'},
                {host: 'dragon085.startdedicated.de', ports: { wss: null, ssl: 50002, tcp: null, }, ip: '', version: '1.4'},
                {host: 'e-1.claudioboxx.com', ports: { wss: null, ssl: 50002, tcp: 50001, }, ip: '', version: '1.4'},
                {host: 'e.keff.org', ports: { wss: null, ssl: 50002, tcp: 50001, }, ip: '', version: '1.4'},
                {host: 'electrum-server.ninja', ports: { wss: null, ssl: 50002, tcp: 50001, }, ip: '', version: '1.4'},
                {host: 'electrum-unlimited.criptolayer.net', ports: { wss: null, ssl: 50002, tcp: null, }, ip: '', version: '1.4'},
                {host: 'electrum.eff.ro', ports: { wss: null, ssl: 50002, tcp: 50001, }, ip: '', version: '1.4'},
                {host: 'electrum.festivaldelhumor.org', ports: { wss: null, ssl: 50002, tcp: 50001, }, ip: '', version: '1.4'},
                {host: 'electrum.hsmiths.com', ports: { wss: null, ssl: 50002, tcp: 50001, }, ip: '', version: '1.4'},
                {host: 'electrum.leblancnet.us', ports: { wss: null, ssl: 50002, tcp: 50001, }, ip: '', version: '1.4'},
                {host: 'electrum.mindspot.org', ports: { wss: null, ssl: 50002, tcp: null, }, ip: '', version: '1.4'},
                {host: 'electrum.qtornado.com', ports: { wss: null, ssl: 50002, tcp: 50001, }, ip: '', version: '1.4'},
                {host: 'electrum.taborsky.cz', ports: { wss: null, ssl: 50002, tcp: null, }, ip: '', version: '1.4'},
                {host: 'electrum.villocq.com', ports: { wss: null, ssl: 50002, tcp: 50001, }, ip: '', version: '1.4'},
                {host: 'electrum2.eff.ro', ports: { wss: null, ssl: 50002, tcp: 50001, }, ip: '', version: '1.4'},
                {host: 'electrum2.villocq.com', ports: { wss: null, ssl: 50002, tcp: 50001, }, ip: '', version: '1.4'},
                {host: 'electrumx.bot.nu', ports: { wss: null, ssl: 50002, tcp: 50001, }, ip: '', version: '1.4'},
                {host: 'electrumx.ddns.net', ports: { wss: null, ssl: 50002, tcp: 50001, }, ip: '', version: '1.4'},
                {host: 'electrumx.ftp.sh', ports: { wss: null, ssl: 50002, tcp: null, }, ip: '', version: '1.4'},
                {host: 'electrumx.soon.it', ports: { wss: null, ssl: 50002, tcp: 50001, }, ip: '', version: '1.4'},
                {host: 'elx01.knas.systems', ports: { wss: null, ssl: 50002, tcp: 50001, }, ip: '', version: '1.4'},
                {host: 'fedaykin.goip.de', ports: { wss: null, ssl: 50002, tcp: 50001, }, ip: '', version: '1.4'},
                {host: 'fn.48.org', ports: { wss: null, ssl: 50002, tcp: 50003, }, ip: '', version: '1.4'},
                {host: 'electrum.emzy.de', ports: { wss: null, ssl: 50002, tcp: 50001, }, ip: '', version: '1.4'},
                {host: 'ndnd.selfhost.eu', ports: { wss: null, ssl: 50002, tcp: 50001, }, ip: '', version: '1.4'},
                {host: 'orannis.com', ports: { wss: null, ssl: 50002, tcp: 50001, }, ip: '', version: '1.4'},
                {host: 'rbx.curalle.ovh', ports: { wss: null, ssl: 50002, tcp: null, }, ip: '', version: '1.4'},
                {host: 'tardis.bauerj.eu', ports: { wss: null, ssl: 50002, tcp: 50001, }, ip: '', version: '1.4'},
                {host: 'technetium.network', ports: { wss: null, ssl: 50002, tcp: null, }, ip: '', version: '1.4'},
                {host: 'tomscryptos.com', ports: { wss: null, ssl: 50002, tcp: 50001, }, ip: '', version: '1.4'},
                {host: 'ulrichard.ch', ports: { wss: null, ssl: 50002, tcp: 50001, }, ip: '', version: '1.4'},
                {host: 'vmd27610.contaboserver.net', ports: { wss: null, ssl: 50002, tcp: 50001, }, ip: '', version: '1.4'},
                {host: 'vmd30612.contaboserver.net', ports: { wss: null, ssl: 50002, tcp: 50001, }, ip: '', version: '1.4'},
                {host: 'xray587.startdedicated.de', ports: { wss: null, ssl: 50002, tcp: null, }, ip: '', version: '1.4'},
                {host: 'yuio.top', ports: { wss: null, ssl: 50002, tcp: 50001, }, ip: '', version: '1.4'},
                {host: 'bitcoin.dragon.zone', ports: { wss: null, ssl: 50004, tcp: 50003, }, ip: '', version: '1.4'},
                {host: 'ecdsa.net' , ports: { wss: null, ssl: 110, tcp: 50001, }, ip: '', version: '1.4'},
                {host: 'btc.usebsv.com', ports: { wss: null, ssl: 50006, tcp: null, }, ip: '', version: '1.4'},
                {host: 'e2.keff.org', ports: { wss: null, ssl: 50002, tcp: 50001, }, ip: '', version: '1.4'},
                {host: 'electrum.hodlister.co', ports: { wss: null, ssl: 50002, tcp: null, }, ip: '', version: '1.4'},
                {host: 'electrum3.hodlister.co', ports: { wss: null, ssl: 50002, tcp: null, }, ip: '', version: '1.4'},
                {host: 'electrum5.hodlister.co', ports: { wss: null, ssl: 50002, tcp: null, }, ip: '', version: '1.4'},
                {host: 'electrumx.electricnewyear.net', ports: { wss: null, ssl: 50002, tcp: null, }, ip: '', version: '1.4'},
                {host: 'fortress.qtornado.com', ports: { wss: null, ssl: 443, tcp: 50001, }, ip: '', version: '1.4'},
                {host: 'green-gold.westeurope.cloudapp.azure.com', ports: { wss: null, ssl: 56002, tcp: 56001, }, ip: '', version: '1.4'},
                {host: 'electrumx.erbium.eu', ports: { wss: null, ssl: 50002, tcp: 50001, }, ip: '', version: '1.4'},
                {host: 'electrumx-core.1209k.com', ports: { wss: null, ssl: 50002, tcp: 50001, }, ip: '', version: '1.4.2'},
                {host: 'electrum.aantonop.com', ports: { wss: null, ssl: 50002, tcp: 50001, }, ip: '', version: '1.4.2'},
                {host: 'electrum.bitkoins.nl', ports: { wss: null, ssl: 50512, tcp: 50001, }, ip: '', version: '1.4.2'},
                {host: 'blockstream.info', ports: { wss: null, ssl: 700, tcp: 110, }, ip: '', version: '1.4'},
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
