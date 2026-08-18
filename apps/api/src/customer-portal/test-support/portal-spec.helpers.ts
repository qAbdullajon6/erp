/** Cast a partial test double to a constructor dependency without using `any`. */
export function asDependency<T>(mock: unknown): T {
  return mock as T;
}

/** First argument passed to a jest mock's initial call. */
export function firstMockArg<T>(mockFn: jest.Mock): T {
  const calls = mockFn.mock.calls as unknown[][];
  const firstCall = calls[0];
  if (!firstCall) {
    throw new Error("Mock was not called");
  }
  return firstCall[0] as T;
}
