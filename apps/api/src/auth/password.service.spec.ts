import { PasswordService } from "./password.service";

describe("PasswordService", () => {
  const service = new PasswordService();

  it("hashes a password and verifies it correctly", async () => {
    const hash = await service.hash("correct horse battery staple");
    expect(hash).not.toEqual("correct horse battery staple");

    await expect(service.verify("correct horse battery staple", hash)).resolves.toBe(true);
    await expect(service.verify("wrong password", hash)).resolves.toBe(false);
  });
});
