import { stringToBytes, bytesToString } from "./helpers";
export const DEFAULT_ENDPOINT = 'wss://api.nimiqwatch.com:50002';
export const DEFAULT_TOKEN = 'mainnet:electrum.blockstream.info';
export class ElectrumWS {
    constructor(endpoint = DEFAULT_ENDPOINT, options = {}) {
        this.requests = new Map();
        this.subscriptions = new Map();
        this.pingInterval = -1;
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
    async request(method, ...params) {
        console.debug('ElectrumWS SEND:', method, ...params);
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
        await this.connected;
        this.ws.send(stringToBytes(JSON.stringify(payload) + (this.options.proxy ? '\n' : '')));
        return promise;
    }
    async subscribe(method, callback, ...params) {
        method = `${method}.subscribe`;
        const subscriptionKey = `${method}${typeof params[0] === 'string' ? `-${params[0]}` : ''}`;
        this.subscriptions.set(subscriptionKey, callback);
        callback(await this.request(method, ...params));
    }
    async unsubscribe(method, ...params) {
        method = `${method}.subscribe`;
        const subscriptionKey = `${method}${typeof params[0] === 'string' ? `-${params[0]}` : ''}`;
        this.subscriptions.delete(subscriptionKey);
        return this.request(`${method}.unsubscribe`, ...params);
    }
    setupConnectedPromise() {
        this.connected = new Promise((resolve, reject) => {
            this.connectedResolver = resolve;
            this.connectedRejector = reject;
        });
    }
    onOpen() {
        console.debug('ElectrumWS OPEN');
        this.connectedResolver();
        this.pingInterval = window.setInterval(() => this.request('server.ping'), 30 * 1000);
    }
    onMessage(msg) {
        const response = JSON.parse(bytesToString(msg.data));
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
    onError(event) {
        console.error('ElectrumWS ERROR:', event);
    }
    onClose(event) {
        console.warn('ElectrumWS CLOSED:', event);
        this.connectedRejector();
        this.setupConnectedPromise();
        clearInterval(this.pingInterval);
    }
}
