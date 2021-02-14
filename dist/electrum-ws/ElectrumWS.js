import { Observable } from './Observable';
import { stringToBytes, bytesToString } from './helpers';
export var ElectrumWSEvent;
(function (ElectrumWSEvent) {
    ElectrumWSEvent["OPEN"] = "open";
    ElectrumWSEvent["CLOSE"] = "close";
    ElectrumWSEvent["CONNECTED"] = "connected";
    ElectrumWSEvent["DISCONNECTED"] = "disconnected";
    ElectrumWSEvent["RECONNECTING"] = "reconnecting";
    ElectrumWSEvent["ERROR"] = "error";
    ElectrumWSEvent["MESSAGE"] = "message";
})(ElectrumWSEvent || (ElectrumWSEvent = {}));
export const DEFAULT_ENDPOINT = 'wss://api.nimiqwatch.com:50002';
export const DEFAULT_TOKEN = 'mainnet:electrum.blockstream.info';
const RECONNECT_TIMEOUT = 1000;
const CONNECTED_TIMEOUT = 500;
const REQUEST_TIMEOUT = 1000 * 10;
const CLOSE_CODE = 1000;
export class ElectrumWS extends Observable {
    constructor(endpoint = DEFAULT_ENDPOINT, options = {}) {
        super();
        this.requests = new Map();
        this.subscriptions = new Map();
        this.connected = false;
        this.reconnectionTimeout = -1;
        this.incompleteMessage = '';
        this.endpoint = endpoint;
        this.options = Object.assign({
            proxy: true,
            token: DEFAULT_TOKEN,
            reconnect: true,
        }, options);
        this.connect();
        Object.values(ElectrumWSEvent).forEach((ev) => {
            this.on(ev, (e) => e
                ? console.debug(`ElectrumWS - ${ev.toUpperCase()}:`, e)
                : console.debug(`ElectrumWS - ${ev.toUpperCase()}`));
        });
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
        if (!this.connected) {
            await new Promise((resolve) => this.once(ElectrumWSEvent.CONNECTED, () => resolve(true)));
        }
        const promise = new Promise((resolve, reject) => {
            const timeout = window.setTimeout(() => {
                this.requests.delete(id);
                reject(new Error('Request timeout'));
            }, REQUEST_TIMEOUT);
            this.requests.set(id, {
                resolve,
                reject,
                method,
                timeout,
            });
        });
        console.debug('ElectrumWS SEND:', method, ...params);
        this.ws.send(this.options.proxy ? stringToBytes(JSON.stringify(payload) + '\n') : JSON.stringify(payload));
        return promise;
    }
    async subscribe(method, callback, ...params) {
        const subscriptionKey = `${method}${typeof params[0] === 'string' ? `-${params[0]}` : ''}`;
        this.subscriptions.set(subscriptionKey, callback);
        if (!this.connected)
            return;
        callback(...params, await this.request(`${method}.subscribe`, ...params));
    }
    async unsubscribe(method, ...params) {
        const subscriptionKey = `${method}${typeof params[0] === 'string' ? `-${params[0]}` : ''}`;
        this.subscriptions.delete(subscriptionKey);
        return this.request(`${method}.unsubscribe`, ...params);
    }
    isConnected() {
        return this.connected;
    }
    async close(reason) {
        this.options.reconnect = false;
        for (const [id, request] of this.requests) {
            window.clearTimeout(request.timeout);
            this.requests.delete(id);
            console.debug('Rejecting pending request:', request.method);
            request.reject(new Error(reason));
        }
        window.clearTimeout(this.reconnectionTimeout);
        if (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN) {
            const closingPromise = new Promise((resolve) => this.once(ElectrumWSEvent.CLOSE, () => resolve(true)));
            this.ws.close(CLOSE_CODE, reason);
            return closingPromise;
        }
    }
    connect() {
        let url = this.endpoint;
        if (this.options.proxy && this.options.token) {
            url = `${url}?token=${this.options.token}`;
        }
        this.ws = new WebSocket(url, this.options.proxy ? 'binary' : undefined);
        this.ws.binaryType = 'arraybuffer';
        this.ws.addEventListener('open', this.onOpen.bind(this));
        this.ws.addEventListener('message', this.onMessage.bind(this));
        this.ws.addEventListener('error', this.onError.bind(this));
        this.ws.addEventListener('close', this.onClose.bind(this));
    }
    onOpen() {
        this.fire(ElectrumWSEvent.OPEN);
        this.connectedTimeout = window.setTimeout(() => {
            this.connected = true;
            this.fire(ElectrumWSEvent.CONNECTED);
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
        }, CONNECTED_TIMEOUT);
    }
    onMessage(msg) {
        const raw = typeof msg.data === 'string' ? msg.data : bytesToString(msg.data);
        const lines = raw.split('\n').filter(line => line.length > 0);
        for (const line of lines) {
            const response = this.parseLine(line);
            if (!response)
                continue;
            this.fire(ElectrumWSEvent.MESSAGE, response);
            if ('id' in response && this.requests.has(response.id)) {
                const request = this.requests.get(response.id);
                window.clearTimeout(request.timeout);
                this.requests.delete(response.id);
                if ('result' in response) {
                    request.resolve(response.result);
                }
                else if (response.error) {
                    request.reject(new Error(typeof response.error === 'string' ? response.error : response.error.message));
                }
                else {
                    request.reject(new Error('No result'));
                }
            }
            if ('method' in response && (response.method).endsWith('subscribe')) {
                const method = response.method.replace('.subscribe', '');
                const params = response.params || [];
                const subscriptionKey = `${method}${typeof params[0] === 'string' ? `-${params[0]}` : ''}`;
                if (this.subscriptions.has(subscriptionKey)) {
                    const callback = this.subscriptions.get(subscriptionKey);
                    callback(...params);
                }
            }
        }
    }
    parseLine(line) {
        try {
            const parsed = JSON.parse(line);
            this.incompleteMessage = '';
            return parsed;
        }
        catch (error) {
        }
        if (this.incompleteMessage && !line.includes(this.incompleteMessage)) {
            return this.parseLine(`${this.incompleteMessage}${line}`);
        }
        this.incompleteMessage = line;
        return false;
    }
    onError(event) {
        if (event.error) {
            console.error('ElectrumWS ERROR:', event.error);
            this.fire(ElectrumWSEvent.ERROR, event.error);
        }
    }
    onClose(event) {
        this.fire(ElectrumWSEvent.CLOSE, event);
        if (!this.connected)
            window.clearTimeout(this.connectedTimeout);
        else
            this.fire(ElectrumWSEvent.DISCONNECTED);
        if (this.options.reconnect && this.connected) {
            this.fire(ElectrumWSEvent.RECONNECTING);
            this.reconnectionTimeout = window.setTimeout(() => this.connect(), RECONNECT_TIMEOUT);
        }
        this.connected = false;
    }
}
