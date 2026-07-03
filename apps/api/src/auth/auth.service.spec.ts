import { NotImplementedException } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { PasswordService } from "./password.service";

describe("AuthService (preparation-only stubs)", () => {
  const service = new AuthService(new PasswordService());

  it("register() is a documented placeholder", async () => {
    await expect(service.register()).rejects.toBeInstanceOf(NotImplementedException);
  });

  it("login() is a documented placeholder", async () => {
    await expect(service.login()).rejects.toBeInstanceOf(NotImplementedException);
  });

  it("refreshAccessToken() is a documented placeholder", async () => {
    await expect(service.refreshAccessToken()).rejects.toBeInstanceOf(NotImplementedException);
  });

  it("selectOrganization() is a documented placeholder", async () => {
    await expect(service.selectOrganization()).rejects.toBeInstanceOf(NotImplementedException);
  });
});
