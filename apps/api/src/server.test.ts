import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const prisma = new PrismaClient();
let app: Awaited<typeof import("./server.js")>["app"];

const demoUserId = "usr_demo_001";
const demoWalletId = "wal_demo_001";
const demoLockerId = "lck_labtek_v_itb";
const libraryLockerId = "lck_perpustakaan_pusat_itb";
let testUserCounter = 0;

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  process.env.API_PORT ??= "4000";
  process.env.DATABASE_URL ??= "postgresql://colokin:colokin@127.0.0.1:15432/colokin?schema=public";
  process.env.JWT_ACCESS_SECRET ??= "dev_access_secret_change_me";
  process.env.JWT_REFRESH_SECRET ??= "dev_refresh_secret_change_me";
  process.env.MQTT_URL ??= "mqtt://127.0.0.1:1883";
  process.env.IOT_MODE ??= "mock";
  process.env.PUSH_ENABLED = "false";
  process.env.PUSH_PROVIDER = "expo";
  process.env.FCM_ENABLED = "false";

  await seedDemoData();
  app = (await import("./server.js")).app;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Milestone 2 backend foundation", () => {
  it("registers a user with a wallet and returns tokens", async () => {
    const unique = uniqueTestSuffix();
    const email = `milestone2-${unique}@example.com`;
    const phone = `+62812${Date.now().toString().slice(-7)}${testUserCounter
      .toString()
      .padStart(2, "0")}`;

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
          availableCableCount: 2,
          totalCompartments: 2,
          status: "ONLINE",
        }),
        expect.objectContaining({
          id: libraryLockerId,
          name: "Perpustakaan Pusat ITB",
          lat: -6.88784,
          lng: 107.61078,
          availableCableCount: 4,
          totalCompartments: 4,
          status: "ONLINE",
        }),
      ]),
    );

    const detailResponse = await request(app).get(`/v1/lockers/${demoLockerId}`);

    expect(detailResponse.status).toBe(200);
    expect(detailResponse.body.data).toMatchObject({
      id: demoLockerId,
      availableCableCount: 2,
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

describe("Milestone 5 rent flow with mock IoT", () => {
  it("returns a rental quote for the Labtek V demo locker", async () => {
    const auth = await registerTestUser();

    const response = await request(app)
      .post("/v1/rentals/quote")
      .set("Authorization", `Bearer ${auth.accessToken}`)
      .send({
        lockerId: demoLockerId,
        durationMinutes: 120,
      });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      lockerId: demoLockerId,
      locationName: "Labtek V ITB",
      durationMinutes: 120,
      rentFee: 50000,
      depositAmount: 0,
      totalCharge: 50000,
      availableCableCount: 2,
    });
  });

  it("rejects quote durations outside the MVP rental limits", async () => {
    const auth = await registerTestUser();

    for (const durationMinutes of [15, 45, 390]) {
      const response = await request(app)
        .post("/v1/rentals/quote")
        .set("Authorization", `Bearer ${auth.accessToken}`)
        .send({
          lockerId: demoLockerId,
          durationMinutes,
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    }
  });

  it("creates an active rental, debits wallet, records transaction and reduces stock", async () => {
    const auth = await registerTestUser();
    const locker = await createQrLocker();
    await setWalletBalance(auth.userId, 100000);

    const response = await request(app)
      .post("/v1/rentals")
      .set("Authorization", `Bearer ${auth.accessToken}`)
      .send({
        lockerId: locker.lockerId,
        compartmentId: locker.compartmentId,
        durationMinutes: 120,
        paymentSource: "WALLET",
      });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      status: "ACTIVE",
      locker: {
        id: locker.lockerId,
        name: locker.name,
      },
      compartmentNumber: 1,
      rentFee: 50000,
      unlockRequestId: expect.stringMatching(/^mock_unlock_/),
    });

    await expect(
      prisma.wallet.findUniqueOrThrow({ where: { userId: auth.userId } }),
    ).resolves.toMatchObject({
      balance: 50000,
    });

    await expect(
      prisma.walletTransaction.findFirstOrThrow({
        where: {
          wallet: {
            userId: auth.userId,
          },
          referenceId: response.body.data.id,
        },
      }),
    ).resolves.toMatchObject({
      amount: 50000,
      direction: "DEBIT",
      status: "SUCCESS",
      type: "RENT_PAYMENT",
    });

    await expect(
      prisma.notification.findFirstOrThrow({
        where: {
          relatedRentalId: response.body.data.id,
          userId: auth.userId,
        },
      }),
    ).resolves.toMatchObject({
      relatedTransactionId: expect.any(String),
      type: "RENT_SUCCESS",
    });

    await expect(
      prisma.compartment.findUniqueOrThrow({ where: { id: locker.compartmentId } }),
    ).resolves.toMatchObject({
      currentCableUnitId: null,
      lastSensorState: "CABLE_ABSENT",
      status: "EMPTY",
    });
    await expect(
      prisma.cableUnit.findUniqueOrThrow({ where: { id: locker.cableUnitId } }),
    ).resolves.toMatchObject({
      status: "RENTED",
    });
  });

  it("rejects rental creation when wallet balance is insufficient", async () => {
    const auth = await registerTestUser();
    const locker = await createQrLocker();
    await setWalletBalance(auth.userId, 10000);

    const response = await request(app)
      .post("/v1/rentals")
      .set("Authorization", `Bearer ${auth.accessToken}`)
      .send({
        lockerId: locker.lockerId,
        compartmentId: locker.compartmentId,
        durationMinutes: 120,
        paymentSource: "WALLET",
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INSUFFICIENT_BALANCE");
  });

  it("blocks duplicate active rentals for the same user", async () => {
    const auth = await registerTestUser();
    const firstLocker = await createQrLocker();
    const secondLocker = await createQrLocker();
    await setWalletBalance(auth.userId, 150000);

    await request(app).post("/v1/rentals").set("Authorization", `Bearer ${auth.accessToken}`).send({
      lockerId: firstLocker.lockerId,
      compartmentId: firstLocker.compartmentId,
      durationMinutes: 60,
      paymentSource: "WALLET",
    });

    const response = await request(app)
      .post("/v1/rentals")
      .set("Authorization", `Bearer ${auth.accessToken}`)
      .send({
        lockerId: secondLocker.lockerId,
        compartmentId: secondLocker.compartmentId,
        durationMinutes: 60,
        paymentSource: "WALLET",
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("USER_HAS_ACTIVE_RENTAL");
  });

  it("rejects rental creation for offline lockers or no available stock", async () => {
    const auth = await registerTestUser();
    const offlineLocker = await createQrLocker({ status: "OFFLINE" });
    const emptyLocker = await createQrLocker({ available: false });
    await setWalletBalance(auth.userId, 100000);

    const offlineResponse = await request(app)
      .post("/v1/rentals")
      .set("Authorization", `Bearer ${auth.accessToken}`)
      .send({
        lockerId: offlineLocker.lockerId,
        compartmentId: offlineLocker.compartmentId,
        durationMinutes: 60,
        paymentSource: "WALLET",
      });

    expect(offlineResponse.status).toBe(400);
    expect(offlineResponse.body.error.code).toBe("LOCKER_OFFLINE");

    const noStockResponse = await request(app)
      .post("/v1/rentals")
      .set("Authorization", `Bearer ${auth.accessToken}`)
      .send({
        lockerId: emptyLocker.lockerId,
        durationMinutes: 60,
        paymentSource: "WALLET",
      });

    expect(noStockResponse.status).toBe(400);
    expect(noStockResponse.body.error.code).toBe("NO_CABLE_AVAILABLE");
  });

  it("returns null or the authenticated user's active rental", async () => {
    const auth = await registerTestUser();

    const emptyResponse = await request(app)
      .get("/v1/rentals/active")
      .set("Authorization", `Bearer ${auth.accessToken}`);

    expect(emptyResponse.status).toBe(200);
    expect(emptyResponse.body.data).toBeNull();

    const locker = await createQrLocker();
    await setWalletBalance(auth.userId, 100000);
    const created = await request(app)
      .post("/v1/rentals")
      .set("Authorization", `Bearer ${auth.accessToken}`)
      .send({
        lockerId: locker.lockerId,
        compartmentId: locker.compartmentId,
        durationMinutes: 120,
        paymentSource: "WALLET",
      });

    const activeResponse = await request(app)
      .get("/v1/rentals/active")
      .set("Authorization", `Bearer ${auth.accessToken}`);

    expect(activeResponse.status).toBe(200);
    expect(activeResponse.body.data).toMatchObject({
      id: created.body.data.id,
      status: "ACTIVE",
      locker: {
        id: locker.lockerId,
        name: locker.name,
      },
      compartmentNumber: 1,
      estimatedFee: 50000,
      fine: 0,
      timeLeftSeconds: expect.any(Number),
    });
  });
});

describe("Milestone 6 active rental timer and notifications", () => {
  it("requires auth and upserts push tokens for the authenticated user", async () => {
    const unauthenticated = await request(app).post("/v1/devices/push-token").send({
      token: "ExponentPushToken[missing-auth]",
      platform: "ios",
    });

    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.body.error.code).toBe("UNAUTHENTICATED");

    const auth = await registerTestUser();
    const first = await request(app)
      .post("/v1/devices/push-token")
      .set("Authorization", `Bearer ${auth.accessToken}`)
      .send({
        token: "ExponentPushToken[milestone6-upsert]",
        platform: "ios",
        deviceId: "device-001",
      });

    expect(first.status).toBe(200);
    expect(first.body.data).toEqual({ success: true });

    const second = await request(app)
      .post("/v1/devices/push-token")
      .set("Authorization", `Bearer ${auth.accessToken}`)
      .send({
        token: "ExponentPushToken[milestone6-upsert]",
        platform: "android",
        deviceId: "device-002",
      });

    expect(second.status).toBe(200);

    const tokens = await prisma.deviceToken.findMany({
      where: { token: "ExponentPushToken[milestone6-upsert]" },
    });
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({
      userId: auth.userId,
      platform: "android",
      deviceId: "device-002",
      revokedAt: null,
    });
  });

  it("revokes the authenticated user's push token", async () => {
    const auth = await registerTestUser();
    await request(app)
      .post("/v1/devices/push-token")
      .set("Authorization", `Bearer ${auth.accessToken}`)
      .send({
        token: "ExponentPushToken[milestone6-revoke]",
        platform: "ios",
      });

    const response = await request(app)
      .delete("/v1/devices/push-token")
      .set("Authorization", `Bearer ${auth.accessToken}`)
      .send({
        token: "ExponentPushToken[milestone6-revoke]",
      });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ success: true });

    const token = await prisma.deviceToken.findUniqueOrThrow({
      where: { token: "ExponentPushToken[milestone6-revoke]" },
    });
    expect(token.revokedAt).toBeInstanceOf(Date);
  });

  it("lists current user notifications newest first and marks one as read", async () => {
    const auth = await registerTestUser();
    const other = await registerTestUser();
    const older = await prisma.notification.create({
      data: {
        userId: auth.userId,
        type: "RENT_SUCCESS",
        title: "Older",
        message: "Older message",
        createdAt: new Date("2026-05-01T01:00:00.000Z"),
      },
    });
    const newer = await prisma.notification.create({
      data: {
        userId: auth.userId,
        type: "RENT_REMINDER",
        title: "Newer",
        message: "Newer message",
        createdAt: new Date("2026-05-01T02:00:00.000Z"),
      },
    });
    await prisma.notification.create({
      data: {
        userId: other.userId,
        type: "SYSTEM",
        title: "Other",
        message: "Other user message",
      },
    });

    const list = await request(app)
      .get("/v1/notifications")
      .set("Authorization", `Bearer ${auth.accessToken}`);

    expect(list.status).toBe(200);
    expect(list.body.data.map((notification: { id: string }) => notification.id)).toEqual([
      newer.id,
      older.id,
    ]);
    expect(list.body.data[0]).toMatchObject({
      type: "RENT_REMINDER",
      title: "Newer",
      message: "Newer message",
      readAt: null,
      relatedRentalId: null,
      relatedTransactionId: null,
    });

    const read = await request(app)
      .patch(`/v1/notifications/${newer.id}/read`)
      .set("Authorization", `Bearer ${auth.accessToken}`);

    expect(read.status).toBe(200);
    expect(read.body.data).toEqual({ success: true });

    const updated = await prisma.notification.findUniqueOrThrow({
      where: { id: newer.id },
    });
    expect(updated.readAt).toBeInstanceOf(Date);
  });

  it("prevents users from marking another user's notification as read", async () => {
    const auth = await registerTestUser();
    const other = await registerTestUser();
    const notification = await prisma.notification.create({
      data: {
        userId: other.userId,
        type: "SYSTEM",
        title: "Other",
        message: "Other user message",
      },
    });

    const response = await request(app)
      .patch(`/v1/notifications/${notification.id}/read`)
      .set("Authorization", `Bearer ${auth.accessToken}`);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
  });

  it("returns overdue active rentals as LATE using server time", async () => {
    const auth = await registerTestUser();
    const locker = await createQrLocker();
    const rental = await prisma.rental.create({
      data: {
        userId: auth.userId,
        lockerId: locker.lockerId,
        compartmentId: locker.compartmentId,
        cableUnitId: locker.cableUnitId,
        status: "ACTIVE",
        durationMinutes: 30,
        startedAt: new Date(Date.now() - 60 * 60 * 1000),
        dueAt: new Date(Date.now() - 30 * 60 * 1000),
        rentFee: 12500,
        totalFee: 12500,
      },
    });

    const response = await request(app)
      .get("/v1/rentals/active")
      .set("Authorization", `Bearer ${auth.accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      id: rental.id,
      status: "LATE",
      timeLeftSeconds: 0,
      fine: 0,
    });

    const updated = await prisma.rental.findUniqueOrThrow({
      where: { id: rental.id },
    });
    expect(updated.status).toBe("LATE");
  });

  it("creates rental reminder and late warning notifications idempotently", async () => {
    const { runRentalReminderSweep } = await import("./modules/rentals/reminders.js");
    const auth = await registerTestUser();
    const locker = await createQrLocker();
    const rental = await prisma.rental.create({
      data: {
        userId: auth.userId,
        lockerId: locker.lockerId,
        compartmentId: locker.compartmentId,
        cableUnitId: locker.cableUnitId,
        status: "ACTIVE",
        durationMinutes: 60,
        startedAt: new Date("2026-05-01T00:00:00.000Z"),
        dueAt: new Date("2026-05-01T01:00:00.000Z"),
        rentFee: 25000,
        totalFee: 25000,
      },
    });

    await runRentalReminderSweep(new Date("2026-05-01T00:45:00.000Z"));
    await runRentalReminderSweep(new Date("2026-05-01T00:55:00.000Z"));
    await runRentalReminderSweep(new Date("2026-05-01T01:00:00.000Z"));
    await runRentalReminderSweep(new Date("2026-05-01T01:01:00.000Z"));
    await runRentalReminderSweep(new Date("2026-05-01T01:01:00.000Z"));

    const notifications = await prisma.notification.findMany({
      where: {
        relatedRentalId: rental.id,
        userId: auth.userId,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    expect(notifications.map((notification) => notification.type)).toEqual([
      "RENT_REMINDER",
      "RENT_REMINDER",
      "RENT_REMINDER",
      "LATE_WARNING",
    ]);
    expect(notifications.map((notification) => notification.title)).toEqual([
      "15 Minutes Left",
      "5 Minutes Left",
      "Rental Due Now",
      "Rental Is Late",
    ]);
  });
});

describe("Milestone 7 return flow with fine payment", () => {
  it("expires an unlocking rental after timeout without charging the wallet", async () => {
    const auth = await registerTestUser();
    await setWalletBalance(auth.userId, 50_000);
    const locker = await createReturnReadyLocker();
    const rental = await prisma.rental.create({
      data: {
        userId: auth.userId,
        lockerId: locker.lockerId,
        compartmentId: locker.rentedCompartmentId,
        cableUnitId: locker.cableUnitId,
        status: "UNLOCKING",
        durationMinutes: 30,
        startedAt: new Date(Date.now() - 90 * 1000),
        dueAt: new Date(Date.now() + 30 * 60 * 1000),
        rentFee: 12_500,
        totalFee: 12_500,
        createdAt: new Date(Date.now() - 90 * 1000),
      },
    });

    const active = await request(app)
      .get("/v1/rentals/active")
      .set("Authorization", `Bearer ${auth.accessToken}`);

    expect(active.status).toBe(200);
    expect(active.body.data).toBeNull();

    const expiredRental = await prisma.rental.findUniqueOrThrow({ where: { id: rental.id } });
    expect(expiredRental.status).toBe("FAILED");

    const wallet = await prisma.wallet.findUniqueOrThrow({
      where: { userId: auth.userId },
    });
    expect(wallet.balance).toBe(50_000);

    await expect(
      prisma.walletTransaction.count({
        where: {
          referenceId: rental.id,
          referenceType: "RENTAL",
          type: {
            in: ["REFUND", "RENT_PAYMENT"],
          },
        },
      }),
    ).resolves.toBe(0);
  });

  it("creates a return intent for an active rental and returns no fine before due time", async () => {
    const auth = await registerTestUser();
    await setWalletBalance(auth.userId, 100000);
    const locker = await createReturnReadyLocker();
    const rental = await createActiveRental(auth.userId, locker, {
      dueAt: new Date(Date.now() + 30 * 60 * 1000),
      startedAt: new Date(Date.now() - 30 * 60 * 1000),
    });

    const response = await request(app)
      .post(`/v1/rentals/${rental.id}/return-intent`)
      .set("Authorization", `Bearer ${auth.accessToken}`)
      .send({ lockerId: locker.lockerId });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      rentalId: rental.id,
      returnLocation: locker.name,
      compartmentNumber: 2,
      fine: 0,
      requiresFinePayment: false,
      status: "READY_TO_RETURN",
    });

    const updatedRental = await prisma.rental.findUniqueOrThrow({ where: { id: rental.id } });
    expect(updatedRental.status).toBe("RETURN_REQUESTED");
  });

  it("requires paying a late fine before return confirmation", async () => {
    const auth = await registerTestUser();
    await setWalletBalance(auth.userId, 100000);
    const locker = await createReturnReadyLocker();
    const rental = await createActiveRental(auth.userId, locker, {
      dueAt: new Date(Date.now() - 45 * 60 * 1000),
      startedAt: new Date(Date.now() - 75 * 60 * 1000),
    });

    const intent = await request(app)
      .post(`/v1/rentals/${rental.id}/return-intent`)
      .set("Authorization", `Bearer ${auth.accessToken}`)
      .send({ lockerId: locker.lockerId });

    expect(intent.status).toBe(200);
    expect(intent.body.data).toMatchObject({
      fine: 12500,
      requiresFinePayment: true,
    });

    const confirmBeforePayment = await request(app)
      .post(`/v1/returns/${intent.body.data.returnSessionId}/confirm`)
      .set("Authorization", `Bearer ${auth.accessToken}`);

    expect(confirmBeforePayment.status).toBe(400);
    expect(confirmBeforePayment.body.error.code).toBe("RETURN_NOT_VERIFIED");

    const payment = await request(app)
      .post(`/v1/returns/${intent.body.data.returnSessionId}/pay-fine`)
      .set("Authorization", `Bearer ${auth.accessToken}`);

    expect(payment.status).toBe(200);
    expect(payment.body.data).toMatchObject({
      fine: 12500,
      paid: true,
      walletBalance: 87500,
    });
    expect(payment.body.data.walletTransactionId).toEqual(expect.any(String));

    const secondPayment = await request(app)
      .post(`/v1/returns/${intent.body.data.returnSessionId}/pay-fine`)
      .set("Authorization", `Bearer ${auth.accessToken}`);

    expect(secondPayment.status).toBe(200);
    expect(secondPayment.body.data.walletTransactionId).toBe(payment.body.data.walletTransactionId);

    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: auth.userId } });
    expect(wallet.balance).toBe(87500);
  });

  it("verifies a mock sensor return, clears active rental, and lists the completed transaction", async () => {
    const auth = await registerTestUser();
    await setWalletBalance(auth.userId, 100000);
    const locker = await createReturnReadyLocker();
    const rental = await createActiveRental(auth.userId, locker, {
      dueAt: new Date(Date.now() + 30 * 60 * 1000),
      startedAt: new Date(Date.now() - 30 * 60 * 1000),
    });

    const intent = await request(app)
      .post(`/v1/rentals/${rental.id}/return-intent`)
      .set("Authorization", `Bearer ${auth.accessToken}`)
      .send({ lockerId: locker.lockerId });

    const confirm = await request(app)
      .post(`/v1/returns/${intent.body.data.returnSessionId}/confirm`)
      .set("Authorization", `Bearer ${auth.accessToken}`);

    expect(confirm.status).toBe(200);
    expect(confirm.body.data).toMatchObject({
      returnSessionId: intent.body.data.returnSessionId,
      status: "WAITING_FOR_SENSOR",
      compartmentNumber: 2,
    });

    const status = await request(app)
      .get(`/v1/returns/${intent.body.data.returnSessionId}`)
      .set("Authorization", `Bearer ${auth.accessToken}`);

    expect(status.status).toBe(200);
    expect(status.body.data).toMatchObject({
      id: intent.body.data.returnSessionId,
      rentalId: rental.id,
      status: "VERIFIED",
      finalFee: 12500,
      fine: 0,
    });

    const active = await request(app)
      .get("/v1/rentals/active")
      .set("Authorization", `Bearer ${auth.accessToken}`);

    expect(active.status).toBe(200);
    expect(active.body.data).toBeNull();

    const returnedRental = await prisma.rental.findUniqueOrThrow({
      where: { id: rental.id },
      include: { cableUnit: true },
    });
    expect(returnedRental.status).toBe("RETURNED");
    expect(returnedRental.returnedAt).toBeInstanceOf(Date);
    expect(returnedRental.cableUnit.status).toBe("AVAILABLE");
    expect(returnedRental.cableUnit.currentCompartmentId).toBe(locker.returnCompartmentId);

    const returnCompartment = await prisma.compartment.findUniqueOrThrow({
      where: { id: locker.returnCompartmentId },
    });
    expect(returnCompartment.status).toBe("AVAILABLE");
    expect(returnCompartment.lastSensorState).toBe("CABLE_PRESENT");
    expect(returnCompartment.currentCableUnitId).toBe(locker.cableUnitId);

    const notification = await prisma.notification.findFirstOrThrow({
      where: {
        relatedRentalId: rental.id,
        type: "RETURN_SUCCESS",
        userId: auth.userId,
      },
    });
    expect(notification.title).toBe("Return Success");

    const transactions = await request(app)
      .get("/v1/transactions")
      .set("Authorization", `Bearer ${auth.accessToken}`);

    expect(transactions.status).toBe(200);
    expect(transactions.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: rental.id,
          type: "RENTAL",
          status: "RETURNED",
          locationName: locker.name,
          totalRentFee: 12500,
          durationMinutes: 30,
        }),
      ]),
    );
  });

  it("marks the return as failed and the cable as lost when return sensor verification times out", async () => {
    const auth = await registerTestUser();
    const locker = await createReturnReadyLocker();
    const rental = await createActiveRental(auth.userId, locker, {
      dueAt: new Date(Date.now() + 30 * 60 * 1000),
      startedAt: new Date(Date.now() - 30 * 60 * 1000),
    });

    const returnSession = await prisma.returnSession.create({
      data: {
        rentalId: rental.id,
        returnLockerId: locker.lockerId,
        returnCompartmentId: locker.returnCompartmentId,
        status: "WAITING_FOR_SENSOR",
        openedAt: new Date(Date.now() - 10 * 60 * 1000),
        sensorTimeoutAt: new Date(Date.now() - 60 * 1000),
      },
    });
    await prisma.rental.update({
      where: { id: rental.id },
      data: { status: "WAITING_FOR_SENSOR" },
    });

    const response = await request(app)
      .get(`/v1/returns/${returnSession.id}`)
      .set("Authorization", `Bearer ${auth.accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      id: returnSession.id,
      rentalId: rental.id,
      status: "FAILED",
      verifiedAt: null,
    });

    const updatedRental = await prisma.rental.findUniqueOrThrow({
      where: { id: rental.id },
      include: { cableUnit: true },
    });
    expect(updatedRental.status).toBe("FAILED");
    expect(updatedRental.returnedAt).toBeNull();
    expect(updatedRental.cableUnit.status).toBe("LOST");
    expect(updatedRental.cableUnit.currentCompartmentId).toBeNull();
    expect(updatedRental.cableUnit.currentLockerId).toBeNull();

    const updatedCompartment = await prisma.compartment.findUniqueOrThrow({
      where: { id: locker.returnCompartmentId },
    });
    expect(updatedCompartment.status).toBe("EMPTY");
    expect(updatedCompartment.lastSensorState).toBe("CABLE_ABSENT");
    expect(updatedCompartment.currentCableUnitId).toBeNull();
  });
});

describe("Milestone 8 transactions and notifications", () => {
  it("lists returned rentals and successful wallet transactions newest first for the authenticated user", async () => {
    const auth = await registerTestUser();
    const other = await registerTestUser();
    const locker = await createReturnReadyLocker();
    const rental = await createActiveRental(auth.userId, locker, {
      dueAt: new Date("2026-05-01T02:00:00.000Z"),
      startedAt: new Date("2026-05-01T01:00:00.000Z"),
    });
    await prisma.rental.update({
      where: { id: rental.id },
      data: {
        returnedAt: new Date("2026-05-01T03:00:00.000Z"),
        status: "RETURNED",
      },
    });

    const topUp = await request(app)
      .post("/v1/wallet/topups")
      .set("Authorization", `Bearer ${auth.accessToken}`)
      .send({ amount: 100000 });
    const confirmedTopUp = await request(app)
      .post(`/v1/wallet/topups/${topUp.body.data.topUpId}/confirm`)
      .set("Authorization", `Bearer ${auth.accessToken}`)
      .send({ dummyQrPayload: topUp.body.data.dummyQrPayload });

    await prisma.walletTransaction.create({
      data: {
        amount: 75000,
        direction: "CREDIT",
        referenceId: "other_topup_milestone_8",
        referenceType: "TOP_UP",
        status: "SUCCESS",
        type: "TOP_UP",
        wallet: {
          connect: {
            userId: other.userId,
          },
        },
      },
    });

    const response = await request(app)
      .get("/v1/transactions")
      .set("Authorization", `Bearer ${auth.accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: rental.id,
          type: "RENTAL",
          status: "RETURNED",
          locationName: locker.name,
          totalRentFee: 12500,
          durationMinutes: 30,
        }),
        expect.objectContaining({
          id: confirmedTopUp.body.data.walletTransactionId,
          type: "TOP_UP",
          amount: 100000,
          direction: "CREDIT",
          status: "SUCCESS",
          referenceId: topUp.body.data.topUpId,
          referenceType: "TOP_UP",
        }),
      ]),
    );
    expect(response.body.data).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          referenceId: "other_topup_milestone_8",
        }),
      ]),
    );

    const returnedIndex = response.body.data.findIndex(
      (item: { id: string }) => item.id === rental.id,
    );
    const topUpIndex = response.body.data.findIndex(
      (item: { id: string }) => item.id === confirmedTopUp.body.data.walletTransactionId,
    );
    expect(topUpIndex).toBeGreaterThanOrEqual(0);
    expect(returnedIndex).toBeGreaterThanOrEqual(0);
    expect(topUpIndex).toBeLessThan(returnedIndex);
  });
});

describe("Feedback API", () => {
  it("requires authentication to submit feedback", async () => {
    const response = await request(app).post("/v1/feedback").send({
      category: "SUPPORT",
      subject: "Need help",
      message: "Please help me with a locker issue.",
    });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("stores valid feedback for the authenticated user", async () => {
    const auth = await registerTestUser();

    const response = await request(app)
      .post("/v1/feedback")
      .set("Authorization", `Bearer ${auth.accessToken}`)
      .send({
        category: "BUG_REPORT",
        subject: "Scanner issue",
        message: "The scanner could not read the locker QR at Labtek V.",
      });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      category: "BUG_REPORT",
      subject: "Scanner issue",
      message: "The scanner could not read the locker QR at Labtek V.",
      status: "OPEN",
      createdAt: expect.any(String),
    });

    const feedback = await prisma.feedback.findUniqueOrThrow({
      where: {
        id: response.body.data.id,
      },
    });
    expect(feedback.userId).toBe(auth.userId);
  });

  it("validates required feedback fields", async () => {
    const auth = await registerTestUser();

    const response = await request(app)
      .post("/v1/feedback")
      .set("Authorization", `Bearer ${auth.accessToken}`)
      .send({
        category: "SUPPORT",
        subject: "",
        message: "short",
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
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

  await prisma.rental.deleteMany({
    where: {
      userId: user.id,
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

  const staleLabtekNumbers = Array.from({ length: 6 }, (_, index) => index + 3);
  await prisma.cableUnit.deleteMany({
    where: {
      id: {
        in: staleLabtekNumbers.map(
          (number) => `cbl_labtek_v_${number.toString().padStart(3, "0")}`,
        ),
      },
    },
  });
  await prisma.compartment.deleteMany({
    where: {
      lockerId: locker.id,
      number: {
        in: staleLabtekNumbers,
      },
    },
  });

  for (let number = 1; number <= 2; number += 1) {
    await prisma.compartment.upsert({
      where: {
        lockerId_number: {
          lockerId: locker.id,
          number,
        },
      },
      update: {
        status: "AVAILABLE",
        lastSensorState: "CABLE_PRESENT",
      },
      create: {
        id: `cmp_labtek_v_${number.toString().padStart(3, "0")}`,
        lockerId: locker.id,
        number,
        status: "AVAILABLE",
        lastSensorState: "CABLE_PRESENT",
      },
    });
  }

  for (let number = 1; number <= 2; number += 1) {
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

  const libraryLocker = await prisma.locker.upsert({
    where: { id: libraryLockerId },
    update: {
      name: "Perpustakaan Pusat ITB",
      address: "Kampus ITB Ganesha, Bandung",
      lat: -6.887839742717819,
      lng: 107.61077991147646,
      status: "ONLINE",
      operationalHours: "24/7",
      lastHeartbeatAt: new Date(),
    },
    create: {
      id: libraryLockerId,
      name: "Perpustakaan Pusat ITB",
      address: "Kampus ITB Ganesha, Bandung",
      lat: -6.887839742717819,
      lng: 107.61077991147646,
      status: "ONLINE",
      operationalHours: "24/7",
      lastHeartbeatAt: new Date(),
    },
  });

  for (let number = 1; number <= 4; number += 1) {
    const compartmentId = `cmp_perpus_pusat_${number.toString().padStart(3, "0")}`;
    await prisma.compartment.upsert({
      where: {
        lockerId_number: {
          lockerId: libraryLocker.id,
          number,
        },
      },
      update: {
        status: "AVAILABLE",
        lastSensorState: "CABLE_PRESENT",
      },
      create: {
        id: compartmentId,
        lockerId: libraryLocker.id,
        number,
        status: "AVAILABLE",
        lastSensorState: "CABLE_PRESENT",
      },
    });

    const cableUnit = await prisma.cableUnit.upsert({
      where: { serialNumber: `COL-PERPUS-${number.toString().padStart(3, "0")}` },
      update: {
        status: "AVAILABLE",
        specification: "Extension cable 4 outlet, 3 meter, 2500W",
        isSniCertified: true,
        hasOverloadProtection: true,
        currentLockerId: libraryLocker.id,
        currentCompartmentId: compartmentId,
      },
      create: {
        id: `cbl_perpus_pusat_${number.toString().padStart(3, "0")}`,
        serialNumber: `COL-PERPUS-${number.toString().padStart(3, "0")}`,
        status: "AVAILABLE",
        specification: "Extension cable 4 outlet, 3 meter, 2500W",
        isSniCertified: true,
        hasOverloadProtection: true,
        currentLockerId: libraryLocker.id,
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
  const unique = uniqueTestSuffix();
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

function uniqueTestSuffix() {
  testUserCounter += 1;
  return `${Date.now()}-${testUserCounter}-${Math.random().toString(36).slice(2)}`;
}

async function setWalletBalance(userId: string, balance: number) {
  await prisma.wallet.update({
    where: { userId },
    data: {
      balance,
    },
  });
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

async function createReturnReadyLocker() {
  const unique = `${Date.now()}-${testUserCounter}-${Math.random().toString(36).slice(2)}`;
  const lockerId = `lck_return_${unique}`;
  const rentedCompartmentId = `cmp_return_rented_${unique}`;
  const returnCompartmentId = `cmp_return_empty_${unique}`;
  const cableUnitId = `cbl_return_${unique}`;

  const locker = await prisma.locker.create({
    data: {
      id: lockerId,
      name: `Return Locker ${unique}`,
      address: "Jl. Ganesa No. 10, Bandung",
      lat: -6.890538487737392,
      lng: 107.6098075829657,
      status: "ONLINE",
      operationalHours: "24/7",
      lastHeartbeatAt: new Date(),
      compartments: {
        create: [
          {
            id: rentedCompartmentId,
            number: 1,
            status: "RENTED",
            lastSensorState: "CABLE_ABSENT",
          },
          {
            id: returnCompartmentId,
            number: 2,
            status: "EMPTY",
            lastSensorState: "CABLE_ABSENT",
          },
        ],
      },
    },
  });

  await prisma.cableUnit.create({
    data: {
      id: cableUnitId,
      serialNumber: `COL-RETURN-${unique}`,
      status: "RENTED",
      specification: "Extension cable 4 outlet, 3 meter, 2500W",
      isSniCertified: true,
      hasOverloadProtection: true,
      currentLockerId: null,
      currentCompartmentId: null,
    },
  });

  return {
    cableUnitId,
    lockerId,
    name: locker.name,
    rentedCompartmentId,
    returnCompartmentId,
  };
}

async function createActiveRental(
  userId: string,
  locker: Awaited<ReturnType<typeof createReturnReadyLocker>>,
  input: {
    dueAt: Date;
    startedAt: Date;
  },
) {
  return prisma.rental.create({
    data: {
      userId,
      lockerId: locker.lockerId,
      compartmentId: locker.rentedCompartmentId,
      cableUnitId: locker.cableUnitId,
      status: "ACTIVE",
      durationMinutes: 30,
      startedAt: input.startedAt,
      dueAt: input.dueAt,
      rentFee: 12500,
      totalFee: 12500,
    },
  });
}
