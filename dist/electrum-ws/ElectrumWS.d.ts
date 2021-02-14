import { Observable } from './Observable';
export declare type ElectrumWSOptions = {
    proxy: boolean;
    token?: string;
    reconnect: boolean;
};
export declare enum ElectrumWSEvent {
    OPEN = "open",
    CLOSE = "close",
    CONNECTED = "connected",
    DISCONNECTED = "disconnected",
    RECONNECTING = "reconnecting",
    ERROR = "error",
    MESSAGE = "message"
}
export declare const DEFAULT_ENDPOINT = "wss://api.nimiqwatch.com:50002";
export declare const DEFAULT_TOKEN = "mainnet:electrum.blockstream.info";
export declare class ElectrumWS extends Observable {
    private options;
    private endpoint;
    private requests;
    private subscriptions;
    private connected;
    private connectedTimeout;
    private reconnectionTimeout;
    private incompleteMessage;
    ws: WebSocket;
    constructor(endpoint?: string, options?: Partial<ElectrumWSOptions>);
    request(method: string, ...params: (string | number | (string | number)[])[]): Promise<any>;
    subscribe(method: string, callback: (...payload: any[]) => any, ...params: (string | number)[]): Promise<void>;
    unsubscribe(method: string, ...params: (string | number)[]): Promise<any>;
    isConnected(): boolean;
    close(reason: string): Promise<unknown>;
    private connect;
    private onOpen;
    private onMessage;
    private parseLine;
    private onError;
    private onClose;
}
