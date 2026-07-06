export class TargetValueTimer {
    timeout;
    targetValue;
    setTarget(value, duration) {
        this.reset();
        this.targetValue = value;
        this.timeout = setTimeout(() => {
            this.reset();
        }, duration);
    }
    hasTarget() {
        return this.timeout !== undefined;
    }
    getTarget() {
        return this.targetValue;
    }
    reset() {
        if (this.timeout !== undefined) {
            clearTimeout(this.timeout);
        }
        this.targetValue = undefined;
        this.timeout = undefined;
    }
}
