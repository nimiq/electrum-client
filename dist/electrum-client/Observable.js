export class Observable {
    constructor() {
        this.listeners = new Map();
    }
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        return this.listeners.get(event).push(callback) - 1;
    }
    once(event, callback) {
        const id = this.on(event, (...params) => {
            this.off(event, id);
            callback(...params);
        });
    }
    off(event, id) {
        const callbacks = this.listeners.get(event);
        if (!callbacks || callbacks.length < id + 1)
            return;
        callbacks[id] = null;
    }
    allOff(event) {
        this.listeners.delete(event);
    }
    fire(event, ...payload) {
        const callbacks = this.listeners.get(event);
        if (!callbacks || !callbacks.length)
            return;
        for (const callback of callbacks) {
            if (!callback)
                continue;
            callback(...payload);
        }
    }
}
