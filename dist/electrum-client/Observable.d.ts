export declare class Observable {
    private listeners;
    on(event: string, callback: Function): number;
    once(event: string, callback: Function): void;
    off(event: string, id: number): void;
    allOff(event: string): void;
    fire(event: string, ...payload: any[]): void;
}
