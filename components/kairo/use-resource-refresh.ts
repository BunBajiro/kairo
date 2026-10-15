"use client";
import {useEffect, useRef} from 'react';
import {createScopedRefresh} from './scoped-refresh.mjs';

// read/publish refs keep a mounted scope current; scopeKey changes dispose the
// old flight before a new pilot can publish. A revision queues one follow-up.
export function useResourceRefresh<T>(scopeKey: string | number, revision: unknown, read: () => Promise<T>, publish: (value: T) => void, onError: (error: any) => void = () => {}) {
    const currentScope = useRef(scopeKey); currentScope.current = scopeKey;
    const callbacks = useRef({read, publish, onError}); callbacks.current = {read, publish, onError};
    const owner = useRef<ReturnType<typeof createScopedRefresh<T>> | null>(null);
    useEffect(() => {
        const scope = createScopedRefresh<T>({read: () => callbacks.current.read(), canRead: () => currentScope.current === scopeKey, publish: value => {if (currentScope.current === scopeKey) callbacks.current.publish(value);}, onError: error => {if (currentScope.current === scopeKey) callbacks.current.onError(error);}});
        owner.current = scope;
        return () => {scope.close(); if (owner.current === scope) owner.current = null;};
    }, [scopeKey]);
    useEffect(() => {void owner.current?.request();}, [scopeKey, revision]);
}
