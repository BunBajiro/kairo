type Refresh = {request(options?: {force?: boolean}): Promise<void>; visibilityChanged(): void; close(): void};
type Options<T> = {read(): Promise<T>; publish(value: T): void; onError?(error: unknown): void;
    visible?(): boolean; period?(value: T | undefined): number;
    timers?: {setTimeout(callback: () => void, delay: number): any; clearTimeout(timer: any): void}};
export function createAdministrativeRefresh<T>(options: Options<T>): Refresh;
export function marketRefreshPeriod(value: any): number;
type Generation = {edit: number; status: number};
export function createOBSControlRefresh(options: Omit<Options<any>, 'publish' | 'period'> & {
    readStatus?(): Promise<any>; publishConfig(value: any): void; publishStatus(value: any): void;
}): Refresh & {snapshot(): Generation; edited(): void; stream(value: any): void;
    reconnect(): Promise<void>; statusResponse(value: any, generation: Generation): void; saved(value: any, generation: Generation): boolean};
