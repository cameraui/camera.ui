import type { Subscription } from 'rxjs';
export declare class Subscribed {
    private readonly subscriptions;
    addSubscriptions(...subscriptions: Subscription[]): void;
    protected unsubscribe(): void;
}
