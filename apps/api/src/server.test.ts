import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const prisma = new PrismaClient();
let app: Awaited<typeof import("./server.js")>["app"];

const demoUserId = "usr_demo_001";
const demoWalletId = "wal_demo_001";
const demoLockerId = "lck_labtek_v_itb";

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  process.env.API_PORT ??= "4000";
  process.env.DATABASE_URL ??= "postgresql://colokin:colokin@127.0.0.1:15432/colokin?schema=public";
  process.env.JWT_ACCESS_SECRET ??= "dev_access_secret_change_me";
  process.env.JWT_REFRESH_SECRET ??= "dev_refresh_secret_change_me";
  process.env.MQTT_URL ??= "mqtt://127.0.0.1:1883";
  process.env.IOT_MODE ??= "mock";
  process.env.FCM_ENABLED = "false";

  await seedDemoData();
  app = (await import("./server.js")).app;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Milestone 2 backend foundation", () => {
  it("registers a user with a wallet and returns tokens", async () => {
    const email = `milestone2-${Date.now()}@example.com`;
    const phone = `+62812${Date.now().toString().slice(-9)}`;

    const response = await request(app).post("/v1/auth/register").send({
      name: "Milestone Two",
      phone,
      email,
      password: "secret123",
    });

    expect(response.status).toBe(201);
    expect(response.body.data.accessToken).toEqual(expect.any(String));
    expect(response.body.data.refreshToken).toEqual(expect.any(String));
    expect(response.body.data.user.email).toBe(email);

    const wallet = await prisma.wallet.findUnique({
      where: {
        userId: response.body.data.user.id,
      },
    });
    expect(wallet?.balance).toBe(0);
  });

  it("logs in the seeded demo user and upgrades the legacy password hash", async () => {
    const response = await request(app).post("/v1/auth/login").send({
      emailOrPhone: "mrjack@gmail.com",
      password: "secret123",
    });

    expect(response.status).toBe(200);
    expect(response.body.data.user.id).toBe(demoUserId);
    expect(response.body.data.accessToken).toEqual(expect.any(String));

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: demoUserId },
    });
    expect(user.passwordHash.startsWith("scrypt:")).toBe(true);
  });

  it("rejects /me without a token and returns seeded wallet with a valid token", async () => {
    await expect(request(app).get("/v1/me")).resolves.toMatchObject({
      status: 401,
    });

    const login = await request(app).post("/v1/auth/login").send({
      emailOrPhone: "mrjack@gmail.com",
      password: "secret123",
    });

    const response = await request(app)
      .get("/v1/me")
      .set("Authorization", `Bearer ${login.body.data.accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      id: demoUserId,
      name: "Jack Owidudu",
      wallet: {
        balance: 100000,
        currency: "IDR",
      },
      activeRentalId: null,
    });
  });

  it("validates duplicate profile email updates", async () => {
    const login = await request(app).post("/v1/auth/login").send({
      emailOrPhone: "mrjack@gmail.com",
      password: "secret123",
    });

    await prisma.user.upsert({
      where: { email: "duplicate@example.com" },
      update: { phone: "+6281299990000", name: "Duplicate User", passwordHash: "legacy" },
      create: {
        name: "Duplicate User",
        phone: "+6281299990000",
        email: "duplicate@example.com",
        passwordHash: "legacy",
      },
    });

    const response = await request(app)
      .patch("/v1/me")
      .set("Authorization", `Bearer ${login.body.data.accessToken}`)
      .send({ email: "duplicate@example.com" });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns locker availability from PostgreSQL", async () => {
    const listResponse = await request(app).get("/v1/lockers").query({
      lat: -6.8915,
      lng: 107.6107,
      radiusMeters: 3000,
    });

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: demoLockerId,
          name: "Labtek V ITB",
          availableCableCount: 3,
          totalCompartments: 8,
          status: "ONLINE",
        }),
      ]),
    );

    const detailResponse = await request(app).get(`/v1/lockers/${demoLockerId}`);

    expect(detailResponse.status).toBe(200);
    expect(detailResponse.body.data).toMatchObject({
      id: demoLockerId,
      availableCableCount: 3,
      compartments: expect.arrayContaining([
        expect.objectContaining({
          id: "cmp_labtek_v_001",
          number: 1,
          status: "AVAILABLE",
        }),
      ]),
    });
  });
});

async function seedDemoData() {
  const { createHash } = await import("node:crypto");
  const user = await prisma.user.upsert({
    where: { id: demoUserId },
    update: {
      name: "Jack Owidudu",
      phone: "+6281212345678",
      email: "mrjack@gmail.com",
      status: "ACTIVE",
      passwordHash: createHash("sha256").update("secret123").digest("hex"),
    },
    create: {
      id: demoUserId,
      name: "Jack Owidudu",
      phone: "+6281212345678",
      email: "mrjack@gmail.com",
      passwordHash: createHash("sha256").update("secret123").digest("hex"),
      status: "ACTIVE",
    },
  });

  await prisma.wallet.upsert({
    where: { id: demoWalletId },
    update: {
      balance: 100000,
      currency: "IDR",
      userId: user.id,
    },
    create: {
      id: demoWalletId,
      userId: user.id,
      balance: 100000,
      currency: "IDR",
    },
  });

  const locker = await prisma.locker.upsert({
    where: { id: demoLockerId },
    update: {
      name: "Labtek V ITB",
      address: "Jl. Ganesa No. 10, Bandung",
      lat: -6.8915,
      lng: 107.6107,
      status: "ONLINE",
      operationalHours: "24/7",
      lastHeartbeatAt: new Date(),
    },
    create: {
      id: demoLockerId,
      name: "Labtek V ITB",
      address: "Jl. Ganesa No. 10, Bandung",
      lat: -6.8915,
      lng: 107.6107,
      status: "ONLINE",
      operationalHours: "24/7",
      lastHeartbeatAt: new Date(),
    },
  });

  for (let number = 1; number <= 8; number += 1) {
    await prisma.compartment.upsert({
      where: {
        lockerId_number: {
          lockerId: locker.id,
          number,
        },
      },
      update: {
        status: number <= 3 ? "AVAILABLE" : "EMPTY",
        lastSensorState: number <= 3 ? "CABLE_PRESENT" : "CABLE_ABSENT",
      },
      create: {
        id: `cmp_labtek_v_${number.toString().padStart(3, "0")}`,
        lockerId: locker.id,
        number,
        status: number <= 3 ? "AVAILABLE" : "EMPTY",
        lastSensorState: number <= 3 ? "CABLE_PRESENT" : "CABLE_ABSENT",
      },
    });
  }

  for (let number = 1; number <= 3; number += 1) {
    const compartmentId = `cmp_labtek_v_${number.toString().padStart(3, "0")}`;
    const cableUnit = await prisma.cableUnit.upsert({
      where: { serialNumber: `COL-ITB-${number.toString().padStart(3, "0")}` },
      update: {
        status: "AVAILABLE",
        specification: "Extension cable 4 outlet, 3 meter, 2500W",
        isSniCertified: true,
        hasOverloadProtection: true,
        currentLockerId: locker.id,
        currentCompartmentId: compartmentId,
      },
      create: {
        id: `cbl_labtek_v_${number.toString().padStart(3, "0")}`,
        serialNumber: `COL-ITB-${number.toString().padStart(3, "0")}`,
        status: "AVAILABLE",
        specification: "Extension cable 4 outlet, 3 meter, 2500W",
        isSniCertified: true,
        hasOverloadProtection: true,
        currentLockerId: locker.id,
        currentCompartmentId: compartmentId,
      },
    });

    await prisma.compartment.update({
      where: { id: compartmentId },
      data: {
        currentCableUnitId: cableUnit.id,
      },
    });
  }
}
