import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import type { Response } from "supertest";
import { AppModule } from "./../src/app.module";
import { configureApp } from "./../src/app.config";

interface HealthResponseBody {
  data: {
    status: string;
  };
}

describe("AppModule (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /health returns a liveness status without requiring the database", () => {
    return request(app.getHttpServer())
      .get("/health")
      .expect(200)
      .expect((res: Response) => {
        const body = res.body as HealthResponseBody;
        expect(body.data.status).toBe("ok");
      });
  });
});
