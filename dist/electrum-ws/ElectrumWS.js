import { stringToBytes, bytesToString } from "./helpers";
export const DEFAULT_ENDPOINT = 'wss://api.nimiqwatch.com:50002';
export const DEFAULT_TOKEN = 'mainnet:electrum.blockstream.info';
export class ElectrumWS {
    constructor(endpoint = DEFAULT_ENDPOINT, options = {}) {
        this.requests = new Map();
        this.subscriptions = new Map();
        this.connected = false;
        this.pingInterval = -1;
        this.endpoint = endpoint;
        this.options = Object.assign({
            proxy: true,
            token: DEFAULT_TOKEN,
            reconnect: true,
        }, options);
        this.setupConnectedPromise();
        this.connect();
    }
    async request(method, ...params) {
        let id;
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
        await this.connectedPromise;
        console.debug('ElectrumWS SEND:', method, ...params);
        this.ws.send(stringToBytes(JSON.stringify(payload) + (this.options.proxy ? '\n' : '')));
        return promise;
    }
    async subscribe(method, callback, ...params) {
        method = `${method}.subscribe`;
        const subscriptionKey = `${method}${params.length > 0 ? `-${params.join('-')}` : ''}`;
        this.subscriptions.set(subscriptionKey, callback);
        if (!this.connected)
            return;
        callback(await this.request(method, ...params));
    }
    async unsubscribe(method, ...params) {
        method = `${method}.subscribe`;
        const subscriptionKey = `${method}${params.length > 0 ? `-${params.join('-')}` : ''}`;
        this.subscriptions.delete(subscriptionKey);
        return this.request(`${method}.unsubscribe`, ...params);
    }
    setupConnectedPromise() {
        this.connectedPromise = new Promise((resolve, reject) => {
            this.connectedResolver = resolve;
            this.connectedRejector = reject;
        });
    }
    connect() {
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
    ping() {
        this.request('server.ping');
    }
    async onOpen() {
        console.debug('ElectrumWS OPEN');
        this.connected = true;
        this.connectedResolver();
        this.pingInterval = window.setInterval(this.ping.bind(this), 30 * 1000);
        for (const [subscriptionKey, callback] of this.subscriptions) {
            const params = subscriptionKey.split('-');
            const method = params.shift();
            if (!method) {
                console.warn('Cannot resubscribe, no method in subscription key:', subscriptionKey);
                continue;
            }
            callback(await this.request(method, ...params));
        }
    }
    onMessage(msg) {
        const raw = bytesToString(msg.data);
        const lines = raw.split('\n').filter(line => line.length > 0);
        for (const line of lines) {
            const response = JSON.parse(line);
            console.debug('ElectrumWS MSG:', response);
            if ('id' in response && this.requests.has(response.id)) {
                const callbacks = this.requests.get(response.id);
                this.requests.delete(response.id);
                if ("result" in response)
                    callbacks.resolve(response.result);
                else
                    callbacks.reject(new Error(response.error || 'No result'));
            }
            if ('method' in response && (response.method).endsWith('subscribe')) {
                const method = response.method;
                const params = response.params;
                const subscriptionKey = `${method}${typeof params[0] === 'string' ? `-${params[0]}` : ''}`;
                if (this.subscriptions.has(subscriptionKey)) {
                    const callback = this.subscriptions.get(subscriptionKey);
                    callback(...params);
                }
            }
        }
    }
    onError(event) {
        console.error('ElectrumWS ERROR:', event);
    }
    onClose(event) {
        console.warn('ElectrumWS CLOSED:', event);
        clearInterval(this.pingInterval);
        this.connected = false;
        this.connectedRejector();
        if (this.options.reconnect) {
            this.setupConnectedPromise();
            this.connect();
        }
    }
}
