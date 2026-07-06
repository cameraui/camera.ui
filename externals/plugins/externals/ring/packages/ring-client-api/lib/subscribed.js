export class Subscribed {
    subscriptions = [];
    addSubscriptions(...subscriptions) {
        this.subscriptions.push(...subscriptions);
    }
    unsubscribe() {
        this.subscriptions.forEach((subscription) => subscription.unsubscribe());
    }
}
