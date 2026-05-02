import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const prisma = new PrismaClient();
let app: Awaited<typeof import("./server.js")>["app"];

const demoUserId = "usr_demo_001";
const demoWalletId = "wal_demo_001";
const demoLockerId = "lck_labtek_v_itb";
let testUserCounter = 0;

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
      lat: -6.890538487737392,
      lng: 107.6098075829657,
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

describe("Milestone 3 dummy QR top up", () => {
  it("requires authentication for creating and confirming top ups", async () => {
    const createResponse = await request(app).post("/v1/wallet/topups").send({ amount: 100000 });

    expect(createResponse.status).toBe(401);
    expect(createResponse.body.error.code).toBe("UNAUTHENTICATED");

    const confirmResponse = await request(app)
      .post("/v1/wallet/topups/topup_missing/confirm")
      .send({ dummyQrPayload: "colokin://topup/topup_missing?token=demo_missing" });

    expect(confirmResponse.status).toBe(401);
    expect(confirmResponse.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("rejects invalid top up amounts", async () => {
    const auth = await registerTestUser();

    const response = await request(app)
      .post("/v1/wallet/topups")
      .set("Authorization", `Bearer ${auth.accessToken}`)
      .send({ amount: 5000 });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("creates a pending top up with a dummy QR payload", async () => {
    const auth = await registerTestUser();

    const response = await request(app)
      .post("/v1/wallet/topups")
      .set("Authorization", `Bearer ${auth.accessToken}`)
      .send({ amount: 100000 });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      status: "PENDING",
      amount: 100000,
    });
    expect(response.body.data.topUpId).toEqual(expect.any(String));
    expect(response.body.data.dummyQrPayload).toMatch(/^colokin:\/\/topup\/.+\?token=demo_.+/);
    expect(new Date(response.body.data.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("confirms a valid top up once and creates wallet transaction and notification", async () => {
    const auth = await registerTestUser();
    const created = await request(app)
      .post("/v1/wallet/topups")
      .set("Authorization", `Bearer ${auth.accessToken}`)
      .send({ amount: 100000 });

    const response = await request(app)
      .post(`/v1/wallet/topups/${created.body.data.topUpId}/confirm`)
      .set("Authorization", `Bearer ${auth.accessToken}`)
      .send({ dummyQrPayload: created.body.data.dummyQrPayload });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      id: created.body.data.topUpId,
      status: "SUCCESS",
      amount: 100000,
      wallet: {
        balance: 100000,
        currency: "IDR",
      },
      walletTransactionId: expect.any(String),
      notificationId: expect.any(String),
      createdAt: expect.any(String),
      confirmedAt: expect.any(String),
    });

    const walletTransaction = await prisma.walletTransaction.findUniqueOrThrow({
      where: { id: response.body.data.walletTransactionId },
    });
    expect(walletTransaction).toMatchObject({
      amount: 100000,
      direction: "CREDIT",
      referenceId: created.body.data.topUpId,
      referenceType: "TOP_UP",
      status: "SUCCESS",
      type: "TOP_UP",
    });

    const notification = await prisma.notification.findUniqueOrThrow({
      where: { id: response.body.data.notificationId },
    });
    expect(notification).toMatchObject({
      type: "TOP_UP_SUCCESS",
      userId: auth.userId,
    });
  });

  it("rejects invalid dummy QR payloads", async () => {
    const auth = await registerTestUser();
    const created = await request(app)
      .post("/v1/wallet/topups")
      .set("Authorization", `Bearer ${auth.accessToken}`)
      .send({ amount: 50000 });

    const response = await request(app)
      .post(`/v1/wallet/topups/${created.body.data.topUpId}/confirm`)
      .set("Authorization", `Bearer ${auth.accessToken}`)
      .send({ dummyQrPayload: `colokin://topup/${created.body.data.topUpId}?token=demo_wrong` });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("TOPUP_QR_INVALID");
  });

  it("expires pending top ups before confirmation", async () => {
    const auth = await registerTestUser();
    const created = await request(app)
      .post("/v1/wallet/topups")
      .set("Authorization", `Bearer ${auth.accessToken}`)
      .send({ amount: 50000 });

    await prisma.topUp.update({
      where: { id: created.body.data.topUpId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const response = await request(app)
      .post(`/v1/wallet/topups/${created.body.data.topUpId}/confirm`)
      .set("Authorization", `Bearer ${auth.accessToken}`)
      .send({ dummyQrPayload: created.body.data.dummyQrPayload });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("TOPUP_EXPIRED");

    const topUp = await prisma.topUp.findUniqueOrThrow({
      where: { id: created.body.data.topUpId },
    });
    expect(topUp.status).toBe("EXPIRED");
  });

  it("does not double credit already confirmed top ups", async () => {
    const auth = await registerTestUser();
    const created = await request(app)
      .post("/v1/wallet/topups")
      .set("Authorization", `Bearer ${auth.accessToken}`)
      .send({ amount: 50000 });

    await request(app)
      .post(`/v1/wallet/topups/${created.body.data.topUpId}/confirm`)
      .set("Authorization", `Bearer ${auth.accessToken}`)
      .send({ dummyQrPayload: created.body.data.dummyQrPayload });

    const response = await request(app)
      .post(`/v1/wallet/topups/${created.body.data.topUpId}/confirm`)
      .set("Authorization", `Bearer ${auth.accessToken}`)
      .send({ dummyQrPayload: created.body.data.dummyQrPayload });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("TOPUP_ALREADY_CONFIRMED");

    const wallet = await prisma.wallet.findUniqueOrThrow({
      where: { userId: auth.userId },
    });
    expect(wallet.balance).toBe(50000);
  });

  it("returns only the authenticated user's top up detail", async () => {
    const owner = await registerTestUser();
    const other = await registerTestUser();
    const created = await request(app)
      .post("/v1/wallet/topups")
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ amount: 50000 });

    const ownerResponse = await request(app)
      .get(`/v1/wallet/topups/${created.body.data.topUpId}`)
      .set("Authorization", `Bearer ${owner.accessToken}`);

    expect(ownerResponse.status).toBe(200);
    expect(ownerResponse.body.data).toMatchObject({
      id: created.body.data.topUpId,
      status: "PENDING",
      amount: 50000,
      dummyQrPayload: created.body.data.dummyQrPayload,
    });

    const otherResponse = await request(app)
      .get(`/v1/wallet/topups/${created.body.data.topUpId}`)
      .set("Authorization", `Bearer ${other.accessToken}`);

    expect(otherResponse.status).toBe(404);
    expect(otherResponse.body.error.code).toBe("TOPUP_NOT_FOUND");
  });
});

describe("Milestone 4 QR validation", () => {
  it("validates an authenticated locker QR without mutating rental or locker state", async () => {
    const auth = await registerTestUser();
    const locker = await createQrLocker();
    const rentalCountBefore = await prisma.rental.count({
      where: { userId: auth.userId },
    });

    const response = await request(app)
      .post("/v1/qr/validate")
      .set("Authorization", `Bearer ${auth.accessToken}`)
      .send({
        qrPayload: `colokin://locker/${locker.lockerId}?compartment=${locker.compartmentId}`,
        intent: "RENT",
      });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      valid: true,
      intent: "RENT",
      locker: {
        id: locker.lockerId,
        name: locker.name,
        availableCableCount: 1,
      },
      compartment: {
        id: locker.compartmentId,
        number: 1,
        status: "AVAILABLE",
      },
    });

    await expect(
      prisma.compartment.findUniqueOrThrow({
        where: { id: locker.compartmentId },
      }),
    ).resolves.toMatchObject({
      status: "AVAILABLE",
      currentCableUnitId: locker.cableUnitId,
    });
    await expect(prisma.rental.count({ where: { userId: auth.userId } })).resolves.toBe(
      rentalCountBefore,
    );
  });

  it("rejects invalid QR payloads", async () => {
    const auth = await registerTestUser();

    const response = await request(app)
      .post("/v1/qr/validate")
      .set("Authorization", `Bearer ${auth.accessToken}`)
      .send({
        qrPayload: "https://example.com/not-colokin",
        intent: "RENT",
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("QR_INVALID");
  });

  it("rejects missing QR request fields with validation errors", async () => {
    const auth = await registerTestUser();

    const response = await request(app)
      .post("/v1/qr/validate")
      .set("Authorization", `Bearer ${auth.accessToken}`)
      .send({ intent: "RENT" });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns LOCKER_NOT_FOUND for a valid locker QR pointing to a missing locker", async () => {
    const auth = await registerTestUser();

    const response = await request(app)
      .post("/v1/qr/validate")
      .set("Authorization", `Bearer ${auth.accessToken}`)
      .send({
        qrPayload: "colokin://locker/lck_missing_milestone_4",
        intent: "RENT",
      });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("LOCKER_NOT_FOUND");
  });

  it("returns LOCKER_OFFLINE for offline lockers", async () => {
    const auth = await registerTestUser();
    const locker = await createQrLocker({ status: "OFFLINE" });

    const response = await request(app)
      .post("/v1/qr/validate")
      .set("Authorization", `Bearer ${auth.accessToken}`)
      .send({
        qrPayload: `colokin://locker/${locker.lockerId}`,
        intent: "RENT",
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("LOCKER_OFFLINE");
  });

  it("returns NO_CABLE_AVAILABLE when the locker has no available cable compartment", async () => {
    const auth = await registerTestUser();
    const locker = await createQrLocker({ available: false });

    const response = await request(app)
      .post("/v1/qr/validate")
      .set("Authorization", `Bearer ${auth.accessToken}`)
      .send({
        qrPayload: `colokin://locker/${locker.lockerId}`,
        intent: "RENT",
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("NO_CABLE_AVAILABLE");
  });

  it("returns USER_HAS_ACTIVE_RENTAL when the user already has an active rental", async () => {
    const auth = await registerTestUser();
    const locker = await createQrLocker();

    await prisma.rental.create({
      data: {
        userId: auth.userId,
        lockerId: locker.lockerId,
        compartmentId: locker.compartmentId,
        cableUnitId: locker.cableUnitId,
        status: "ACTIVE",
        durationMinutes: 60,
        startedAt: new Date(),
        dueAt: new Date(Date.now() + 60 * 60 * 1000),
        rentFee: 10000,
        totalFee: 10000,
      },
    });

    const response = await request(app)
      .post("/v1/qr/validate")
      .set("Authorization", `Bearer ${auth.accessToken}`)
      .send({
        qrPayload: `colokin://locker/${locker.lockerId}`,
        intent: "RENT",
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("USER_HAS_ACTIVE_RENTAL");
  });

  it("returns QR_INVALID when a requested compartment does not belong to the locker", async () => {
    const auth = await registerTestUser();
    const locker = await createQrLocker();
    const otherLocker = await createQrLocker();

    const response = await request(app)
      .post("/v1/qr/validate")
      .set("Authorization", `Bearer ${auth.accessToken}`)
      .send({
        qrPayload: `colokin://locker/${locker.lockerId}?compartment=${otherLocker.compartmentId}`,
        intent: "RENT",
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("QR_INVALID");
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
      lat: -6.890538487737392,
      lng: 107.6098075829657,
      status: "ONLINE",
      operationalHours: "24/7",
      lastHeartbeatAt: new Date(),
    },
    create: {
      id: demoLockerId,
      name: "Labtek V ITB",
      address: "Jl. Ganesa No. 10, Bandung",
      lat: -6.890538487737392,
      lng: 107.6098075829657,
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

async function registerTestUser() {
  testUserCounter += 1;
  const unique = `${Date.now()}-${testUserCounter}-${Math.random().toString(36).slice(2)}`;
  const email = `topup-${unique}@example.com`;
  const phone = `+62813${Date.now().toString().slice(-8)}${testUserCounter
    .toString()
    .padStart(4, "0")}`;

  const response = await request(app).post("/v1/auth/register").send({
    name: "Top Up Tester",
    phone,
    email,
    password: "secret123",
  });

  expect(response.status).toBe(201);

  return {
    accessToken: response.body.data.accessToken as string,
    userId: response.body.data.user.id as string,
  };
}

async function createQrLocker(options?: { available?: boolean; status?: "ONLINE" | "OFFLINE" }) {
  const unique = `${Date.now()}-${testUserCounter}-${Math.random().toString(36).slice(2)}`;
  const lockerId = `lck_qr_${unique}`;
  const compartmentId = `cmp_qr_${unique}`;
  const cableUnitId = `cbl_qr_${unique}`;
  const available = options?.available ?? true;
  const status = options?.status ?? "ONLINE";

  const locker = await prisma.locker.create({
    data: {
      id: lockerId,
      name: `QR Locker ${unique}`,
      address: "Jl. Ganesa No. 10, Bandung",
      lat: -6.890538487737392,
      lng: 107.6098075829657,
      status,
      operationalHours: "24/7",
      lastHeartbeatAt: new Date(),
      compartments: {
        create: {
          id: compartmentId,
          number: 1,
          status: available ? "AVAILABLE" : "EMPTY",
          lastSensorState: available ? "CABLE_PRESENT" : "CABLE_ABSENT",
        },
      },
    },
  });

  if (available) {
    await prisma.cableUnit.create({
      data: {
        id: cableUnitId,
        serialNumber: `COL-QR-${unique}`,
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
        currentCableUnitId: cableUnitId,
      },
    });
  }

  return {
    cableUnitId,
    compartmentId,
    lockerId,
    name: locker.name,
  };
}
