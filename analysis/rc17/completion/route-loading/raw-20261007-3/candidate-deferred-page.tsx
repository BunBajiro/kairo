"use client";
import {Component, Suspense, type ReactNode} from 'react';
import {Button} from '@/components/ui/button';

class PageLoadBoundary extends Component<{name: string; children: ReactNode}, {failed: boolean}> {
    state = {failed: false};
    static getDerivedStateFromError() {return {failed: true};}
    render() {
        if (this.state.failed) return <section className="panel" role="alert" data-route-load-error>
            <h2>Could not open {this.props.name}</h2>
            <p className="muted">The page could not finish loading. Retry when Kairo is available.</p>
            <Button onClick={() => window.location.reload()}>Retry page</Button>
        </section>;
        return this.props.children;
    }
}

export function DeferredPage({name, children}: {name: string; children: ReactNode}) {
    return <PageLoadBoundary name={name}><Suspense fallback={<section className="panel" role="status" aria-live="polite" data-route-loading>
        <p>Opening {name}…</p>
    </section>}>{children}</Suspense></PageLoadBoundary>;
}
