export {};

declare global {
  interface Window {
    prompt(message?: string, _default?: string): any;
  }
}
