import { ElectrumApi } from '../electrum-api/ElectrumApi';
import { Observable } from './Observable';
import { PlainBlockHeader, Peer } from '../electrum-api/types';
import { GenesisConfig, Network } from './GenesisConfig';

export enum Event {
    HEAD_CHANGE = 'head-change',
}

export class Agent extends Observable {
    private connection: ElectrumApi | null = null;
    private syncing = false;
    private synced = false;
    private orphanedBlocks: PlainBlockHeader[] = [];

    constructor(peer: Peer) {
        super();

        if (peer.ports.wss) {
            console.debug(`Agent: Connecting to wss://${peer.host}:${peer.ports.wss}`);

            this.connection = new ElectrumApi({
                network: GenesisConfig.NETWORK_NAME,
                endpoint: `wss://${peer.host}:${peer.ports.wss}`,
                proxy: false,
                // token: undefined,
            });
        } else if (peer.ports.ssl) {
            console.debug(`Agent: Connecting to ssl://${peer.host}:${peer.ports.ssl}`);

            this.connection = new ElectrumApi({
                network: GenesisConfig.NETWORK_NAME,
                endpoint: 'wss://api.nimiqwatch.com:50003', // SSL-enabled proxy
                proxy: true,
                token: `${this.networkToTokenPrefix(GenesisConfig.NETWORK_NAME)}:${peer.host}`
            });
        } else if (peer.ports.tcp) {
            console.debug(`Agent: Connecting to tcp://${peer.host}:${peer.ports.tcp}`);

            this.connection = new ElectrumApi({
                network: GenesisConfig.NETWORK_NAME,
                endpoint: 'wss://api.nimiqwatch.com:50002', // TCP proxy
                proxy: true,
                token: `${this.networkToTokenPrefix(GenesisConfig.NETWORK_NAME)}:${peer.host}`
            });
        } else {
            throw new Error('No suitable connection protocol and port for peer');
        }

        this.sync();
    }

    public get api() {
        if (!this.connection) {
            throw new Error('Agent not connected');
        }
        return this.connection;
    }

    private async sync() {
        if (this.syncing || this.synced) return;
        this.syncing = true;

        await this.handshake();
        if (!this.connection) return;

        await this.requestHead();
    }

    private async handshake() {
        if (!this.connection) {
            throw new Error('Agent not connected');
        }

        // TODO: Add timeout
        const features = await this.connection.getFeatures();
        if (features.genesis_hash !== GenesisConfig.GENESIS_HASH) {
            this.close();
            return false;
        }
        return true;
    }

    private requestHead() {
        if (!this.connection) {
            throw new Error('Agent not connected');
        }
        this.connection.subscribeHeaders(this.onHeader.bind(this));
    }

    private onHeader(header: PlainBlockHeader) {
        if (this.syncing) {
            this.syncing = false;
            this.synced = true;
        }
        this.fire(Event.HEAD_CHANGE, header);
    }

    private close() {
        // this.connection.close();
        this.connection = null;
        this.syncing = false;
        this.synced = false;
    }

    private networkToTokenPrefix(name: string) {
        if (name === Network.MAIN) return 'mainnet';
        if (name === Network.TEST) return 'testnet';
    }
}
