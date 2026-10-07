import '@testing-library/jest-dom/vitest'

// jsdom does not implement scrolling or layout APIs the app touches.
window.scrollTo = () => {}
window.matchMedia =
  window.matchMedia ||
  (() => ({ matches: false, media: '', addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }))
window.ResizeObserver =
  window.ResizeObserver ||
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
