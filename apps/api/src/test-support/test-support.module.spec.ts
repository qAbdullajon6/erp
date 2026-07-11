import "reflect-metadata";
import { AppModule } from "../app.module";
import { TestSupportModule, testSupportImports } from "./test-support.module";

describe("testSupportImports — the NODE_ENV gate", () => {
  it("yields TestSupportModule under NODE_ENV=test", () => {
    expect(testSupportImports("test")).toEqual([TestSupportModule]);
  });

  it("yields nothing under NODE_ENV=production", () => {
    expect(testSupportImports("production")).toEqual([]);
  });

  it("yields nothing under NODE_ENV=development", () => {
    expect(testSupportImports("development")).toEqual([]);
  });

  /// Passing `undefined` explicitly would trigger the default parameter (and so
  /// read the ambient NODE_ENV, which is "test" under jest). The genuine
  /// "unset" case is an absent environment variable, so clear it for real.
  it("yields nothing when NODE_ENV is unset", () => {
    const original = process.env.NODE_ENV;
    delete process.env.NODE_ENV;
    try {
      expect(testSupportImports()).toEqual([]);
    } finally {
      process.env.NODE_ENV = original;
    }
  });

  it("defaults to the ambient NODE_ENV (which is \"test\" under jest)", () => {
    expect(testSupportImports()).toEqual([TestSupportModule]);
  });
});

describe("AppModule wiring", () => {
  /// Jest runs with NODE_ENV=test, so AppModule must have picked the module up
  /// through the gate — this asserts the real wiring, not just the helper.
  it("registers TestSupportModule in the test environment", () => {
    const imports = (Reflect.getMetadata("imports", AppModule) as unknown[]) ?? [];
    expect(imports).toContain(TestSupportModule);
  });

  it("registers zero test modules in production, so no /test/* route exists", () => {
    expect(testSupportImports("production")).toHaveLength(0);
  });
});
