import "@testing-library/jest-dom";

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// @ts-expect-error Assigning test mock
global.ResizeObserver = ResizeObserverMock;
