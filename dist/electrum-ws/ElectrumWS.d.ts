export declare type ElectrumWSOptions = {
    proxy: boolean;
    token?: string;
    reconnect: boolean;
};
export declare const DEFAULT_ENDPOINT = "wss://api.nimiqwatch.com:50002";
export declare const DEFAULT_TOKEN = "mainnet:electrum.blockstream.info";
export declare class ElectrumWS {
    private options;
    private endpoint;
    private requests;
    private subscriptions;
    private connected;
    private connectedPromise;
    private connectedResolver;
    private connectedRejector;
    private pingInterval;
    private incompleteMessage;
    ws: WebSocket;
    constructor(endpoint?: string, options?: Partial<ElectrumWSOptions>);
    request(method: string, ...params: (string | number)[]): Promise<any>;
    subscribe(method: string, callback: (...payload: any[]) => any, ...params: (string | number)[]): Promise<void>;
    unsubscribe(method: string, ...params: (string | number)[]): Promise<any>;
    close(): void;
    private setupConnectedPromise;
    private connect;
    private ping;
    private onOpen;
    private onMessage;
    private parseLine;
    private onError;
    private onClose;
}