import { stringToBytes, bytesToString } from "./helpers";

type RpcResponse = {
    jsonrpc: string,
    result?: any,
    error?: string,
    id: number,
}

type RpcRequest = {
    jsonrpc: string,
    method: string,
    params?: any[],
}

export type ElectrumWSOptions = {
    proxy: boolean,
    token?: string,
    reconnect: boolean,
}

export const DEFAULT_ENDPOINT = 'wss://api.nimiqwatch.com:50002';
export const DEFAULT_TOKEN = 'mainnet:electrum.blockstream.info';

const RECONNECT_TIMEOUT = 1000;
const CLOSE_CODE = 1000; // 1000 indicates a normal closure, meaning that the purpose for which the connection was established has been fulfilled

export class ElectrumWS {
    private options: ElectrumWSOptions;
    private endpoint: string;

    private requests = new Map<number, {resolve: (result: any) => any, reject: (error: Error) => any, method: string}>();
    private subscriptions = new Map<string, (...payload: any[]) => any>();

    private connected = false;
    private connectedPromise: Promise<void> | null = null;
    private connectedResolver = () => {};
    private connectedRejector = (error: Error) => {};

    private reconnectionTimeout = -1;

    private incompleteMessage = '';

    public ws!: WebSocket;

    constructor(endpoint = DEFAULT_ENDPOINT, options: Partial<ElectrumWSOptions> = {}) {
        this.endpoint = endpoint;

        this.options = Object.assign({
            proxy: true,
            token: DEFAULT_TOKEN,
            reconnect: true,
        }, options);

        this.setupConnectedPromise();
        this.connect();
    }

    public async request(method: string, ...params: (string | number)[]): Promise<any> {
        let id: number;
        do {
            id = Math.ceil(Math.random() * 1e5);
        } while (this.requests.has(id));

        const payload = {
            jsonrpc: "2.0",
            method,
            params,
            id,
        };

        await this.connectedPromise;

        const promise = new Promise((resolve, reject) => {
            this.requests.set(id, {
                resolve,
                reject,
                method,
            });
        });

        console.debug('ElectrumWS SEND:', method, ...params);
        this.ws.send(stringToBytes(JSON.stringify(payload) + (this.options.proxy ? '\n' : '')));

        return promise;
    }

    public async subscribe(method: string, callback: (...payload: any[]) => any, ...params: (string | number)[]) {
        const subscriptionKey = `${method}${typeof params[0] === 'string' ? `-${params[0]}` : ''}`;
        this.subscriptions.set(subscriptionKey, callback);

        // If not currently connected, the subscription will be activated in onOpen()
        if (!this.connected) return;

        callback(...params, await this.request(`${method}.subscribe` , ...params));
    }

    public async unsubscribe(method: string, ...params: (string | number)[]) {
        const subscriptionKey = `${method}${typeof params[0] === 'string' ? `-${params[0]}` : ''}`;
        this.subscriptions.delete(subscriptionKey);

        return this.request(`${method}.unsubscribe`, ...params);
    }

    public close(reason: string) {
        this.options.reconnect = false;

        // Add an error handler, to prevent uncaught exceptions in case no request is currently awaiting it.
        this.connectedPromise!.catch(() => {});

        this.connectedRejector(new Error(reason));

        // Reject all pending requests
        for (const [id, callbacks] of this.requests) {
            this.requests.delete(id);
            callbacks.reject(new Error(reason));
        }

        window.clearTimeout(this.reconnectionTimeout);

        if (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN) {
            this.ws.close(CLOSE_CODE, reason);
        }
    }

    private setupConnectedPromise() {
        this.connectedPromise = new Promise((resolve, reject) => {
            this.connectedResolver = resolve;
            this.connectedRejector = reject;
        });
    }

    private connect() {
        let url = this.endpoint;
        if (this.options.token) {
            url = `${url}?token=${this.options.token}`;
        }

        this.ws = new WebSocket(url, 'binary');
        this.ws.binaryType = 'arraybuffer';

        this.ws.addEventListener('open', this.onOpen.bind(this));
        this.ws.addEventListener('message', this.onMessage.bind(this));
        this.ws.addEventListener('error', this.onError.bind(this));
        this.ws.addEventListener('close', this.onClose.bind(this));
    }

    private async onOpen() {
        console.debug('ElectrumWS OPEN');
        this.connected = true;
        this.connectedResolver();

        // Resubscribe to registered subscriptions
        for (const [subscriptionKey, callback] of this.subscriptions) {
            const params = subscriptionKey.split('-');
            const method = params.shift();
            if (!method) {
                console.warn('Cannot resubscribe, no method in subscription key:', subscriptionKey);
                continue;
            }
            this.subscribe(method, callback, ...params).catch((error) => {
                if (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN) {
                    this.ws.close(CLOSE_CODE, error.message);
                }
            });
        }
    }

    private onMessage(msg: MessageEvent) {
        // Handle potential multi-line frames
        const raw = bytesToString(msg.data as Uint8Array);
        const lines = raw.split('\n').filter(line => line.length > 0);

        for (const line of lines) {
            const response = this.parseLine(line);
            if (!response) continue;
            console.debug('ElectrumWS MSG:', response);

            if ('id' in response && this.requests.has(response.id)) {
                const callbacks = this.requests.get(response.id)!;
                this.requests.delete(response.id);

                if ("result" in response) callbacks.resolve(response.result);
                else callbacks.reject(new Error(response.error || 'No result'));
            }

            if ('method' in response && /** @type {string} */ (response.method).endsWith('subscribe')) {
                const method = response.method.replace('.subscribe', '');
                const params = response.params || [];
                // If first parameter is a string (for scripthash subscriptions), it's part of the subscription key.
                // If first parameter is an object (for header subscriptions), it's not.
                const subscriptionKey = `${method}${typeof params[0] === 'string' ? `-${params[0]}` : ''}`;
                if (this.subscriptions.has(subscriptionKey)) {
                    const callback = this.subscriptions.get(subscriptionKey)!;
                    callback(...params);
                }
            }
        }
    }

    private parseLine(line: string): RpcResponse | RpcRequest | false {
        try {
            // console.debug('Parsing JSON:', line);
            const parsed = JSON.parse(line);
            this.incompleteMessage = '';
            return parsed;
        } catch (error) {
            // Ignore
        }

        if (this.incompleteMessage && !line.includes(this.incompleteMessage)) {
            return this.parseLine(`${this.incompleteMessage}${line}`);
        }

        // console.debug('Failed to parse JSON, retrying together with next message');
        this.incompleteMessage = line;
        return false;
    }

    private onError(event: Event) {
        if ((event as ErrorEvent).error) console.error('ElectrumWS ERROR:', (event as ErrorEvent).error);
    }

    private onClose(event: CloseEvent | Error) {
        // console.debug('ElectrumWS CLOSED:', event);

        if (this.options.reconnect) {
            if (this.connected) this.setupConnectedPromise();
            this.reconnectionTimeout = window.setTimeout(() => this.connect(), RECONNECT_TIMEOUT);
        }

        this.connected = false;
    }
}
