import { stringToBytes, bytesToString } from "./helpers";

type Options = {
    proxy: boolean,
    token?: string,
    // reconnect: true, // Not yet implemented
}

export const DEFAULT_ENDPOINT = 'wss://api.nimiqwatch.com:50002';
export const DEFAULT_TOKEN = 'mainnet:electrum.blockstream.info';

export class ElectrumWS {
    private options: Options;

    private requests = new Map<number, {resolve: (result: any) => any, reject: (error: Error) => any}>();
    private subscriptions = new Map<string, (...payload: any[]) => any>();

    private connected!: Promise<void>;
    private connectedResolver!: () => void;
    private connectedRejector!: () => void;

    private pingInterval: number = -1;

    public ws: WebSocket;

    constructor(endpoint = DEFAULT_ENDPOINT, options: Partial<Options> = {}) {
        this.options = Object.assign({
            proxy: true,
            token: DEFAULT_TOKEN,
        }, options);

        this.setupConnectedPromise();

        this.ws = new WebSocket(`${endpoint}?token=${this.options.token}`, 'binary');
        this.ws.binaryType = 'arraybuffer';

        this.ws.addEventListener('open', this.onOpen.bind(this));
        this.ws.addEventListener('message', this.onMessage.bind(this));
        this.ws.addEventListener('error', this.onError.bind(this));
        this.ws.addEventListener('close', this.onClose.bind(this));
    }

    public async request(method: string, ...params: any[]): Promise<any> {
        console.debug('ElectrumWS SEND:', method, ...params);

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

        const promise = new Promise((resolve, reject) => {
            this.requests.set(id, {
                resolve,
                reject,
            });
        });

        await this.connected;

        this.ws.send(stringToBytes(JSON.stringify(payload) + (this.options.proxy ? '\n' : '')));

        return promise;
    }

    public async subscribe(method: string, callback: (...payload: any[]) => any, ...params: any[]) {
        method = `${method}.subscribe`;
        const subscriptionKey = `${method}${typeof params[0] === 'string' ? `-${params[0]}` : ''}`;
        this.subscriptions.set(subscriptionKey, callback);

        callback(await this.request(method, ...params));
    }

    public async unsubscribe(method: string, ...params: any[]) {
        method = `${method}.subscribe`;
        const subscriptionKey = `${method}${typeof params[0] === 'string' ? `-${params[0]}` : ''}`;
        this.subscriptions.delete(subscriptionKey);

        return this.request(`${method}.unsubscribe`, ...params);
    }

    private setupConnectedPromise() {
        this.connected = new Promise((resolve, reject) => {
            this.connectedResolver = resolve;
            this.connectedRejector = reject;
        });
    }

    private onOpen() {
        console.debug('ElectrumWS OPEN');
        this.connectedResolver();
        this.pingInterval = window.setInterval(() => this.request('server.ping'), 30 * 1000); // Send ping every 30s
    }

    private onMessage(msg: MessageEvent) {
        // Handle potential multi-line frames
        const raw = bytesToString(msg.data as Uint8Array);
        const lines = raw.split('\n').filter(line => line.length > 0);

        for (const line of lines) {
            const response = JSON.parse(line);
            console.debug('ElectrumWS MSG:', response);

            if ('id' in response && this.requests.has(response.id)) {
                const callbacks = this.requests.get(response.id)!;
                this.requests.delete(response.id);

                if ("result" in response) callbacks.resolve(response.result);
                else callbacks.reject(new Error(response.error || 'No result'));
            }

            if ('method' in response && /** @type {string} */ (response.method).endsWith('subscribe')) {
                const method = response.method;
                const params = response.params;
                const subscriptionKey = `${method}${typeof params[0] === 'string' ? `-${params[0]}` : ''}`;
                if (this.subscriptions.has(subscriptionKey)) {
                    const callback = this.subscriptions.get(subscriptionKey)!;
                    callback(...params);
                }
            }
        }
    }

    private onError(event: Event) {
        console.error('ElectrumWS ERROR:', event);
    }

    private onClose(event: CloseEvent) {
        console.warn('ElectrumWS CLOSED:', event);
        this.connectedRejector();
        this.setupConnectedPromise();
        clearInterval(this.pingInterval);
    }
}
