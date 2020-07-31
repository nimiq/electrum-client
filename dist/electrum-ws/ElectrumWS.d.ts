declare type Options = {
    proxy: boolean;
    token?: string;
};
export declare const DEFAULT_ENDPOINT = "wss://api.nimiqwatch.com:50002";
export declare const DEFAULT_TOKEN = "mainnet:electrum.blockstream.info";
export declare class ElectrumWS {
    private options;
    private requests;
    private subscriptions;
    private connected;
    private connectedResolver;
    private connectedRejector;
    private pingInterval;
    ws: WebSocket;
    constructor(endpoint?: string, options?: Partial<Options>);
    request(method: string, ...params: any[]): Promise<any>;
    subscribe(method: string, callback: (...payload: any[]) => any, ...params: any[]): Promise<void>;
    unsubscribe(method: string, ...params: any[]): Promise<any>;
    private setupConnectedPromise;
    private onOpen;
    private onMessage;
    private onError;
    private onClose;
}
export {};
