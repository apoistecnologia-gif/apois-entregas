export {};

declare global {
  interface Window {
    /** Legacy WebView fallback used by the courier incoming-offer alert. */
    webkitAudioContext?: typeof AudioContext;
  }
}
