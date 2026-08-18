import { PasswordService } from "./password.service";

describe("PasswordService", () => {
  const service = new PasswordService();

  it("hashes a password and verifies it correctly", async () => {
    const hash = await service.hash("correct horse battery staple");
    expect(hash).not.toEqual("correct horse battery staple");
    expect(hash).toContain("$argon2id$v=19$m=65536,t=3,p=4$");

    await expect(service.verify("correct horse battery staple", hash)).resolves.toBe(true);
    await expect(service.verify("wrong password", hash)).resolves.toBe(false);
  });
});
