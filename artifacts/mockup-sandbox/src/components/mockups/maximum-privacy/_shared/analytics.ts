// Preview boundary: never load the live analytics client or transmit events.
export function trackEvent(_name: string, _properties?: Record<string, unknown>): void {}
export function trackLandingClick(_target: EventTarget | null): void {}