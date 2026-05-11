import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma.js";
import { handleMqttMessage, mapDetectionPayload } from "./bridge.js";

const testPrefix = "iot-bridge-test";

afterEach(async () => {
  await prisma.iotEventLog.deleteMany({
    where: {
      topic: {
        contains: "colokin/locker/99",
      },
    },
  });
  await prisma.user.deleteMany({
    where: {
      email: {
        contains: testPrefix,
      },
    },
  });
  await prisma.locker.deleteMany({
    where: {
      id: {
        startsWith: testPrefix,
      },
    },
  });
});

describe("ESP32 MQTT bridge", () => {
  it("maps retained detection payloads to Colok.in sensor states", () => {
    expect(mapDetectionPayload("EMPTY")).toBe("CABLE_ABSENT");
    expect(mapDetectionPayload("OCCUPIED")).toBe("CABLE_PRESENT");
    expect(() => mapDetectionPayload("OPEN")).toThrow(/Unsupported detection payload/);
  });

  it("activates an unlocking rental when the ESP32 reports the cable was taken", async () => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const user = await prisma.user.create({
      data: {
        email: `${testPrefix}-${unique}@example.com`,
        name: "IoT Bridge Test",
        passwordHash: "test",
        phone: `+62813${Date.now().toString().slice(-8)}`,
      },
    });
    const wallet = await prisma.wallet.create({
      data: {
        balance: 25_000,
        userId: user.id,
      },
    });
    const locker = await prisma.locker.create({
      data: {
        id: `${testPrefix}-locker-${unique}`,
        address: "MQTT test locker",
        lat: -6.89,
        lng: 107.61,
        name: "MQTT Test Locker",
      },
    });
    const compartment = await prisma.compartment.create({
      data: {
        id: `${testPrefix}-compartment-${unique}`,
        currentCableUnitId: `${testPrefix}-cable-${unique}`,
        lastSensorState: "CABLE_PRESENT",
        lockerId: locker.id,
        number: 99,
        status: "RENTED",
      },
    });
    const cableUnit = await prisma.cableUnit.create({
      data: {
        id: `${testPrefix}-cable-${unique}`,
        currentCompartmentId: compartment.id,
        currentLockerId: locker.id,
        serialNumber: `${testPrefix}-serial-${unique}`,
        specification: "Test cable",
        status: "RENTED",
      },
    });
    const rental = await prisma.rental.create({
      data: {
        cableUnitId: cableUnit.id,
        compartmentId: compartment.id,
        dueAt: new Date(Date.now() + 60 * 60 * 1000),
        durationMinutes: 60,
        lockerId: locker.id,
        rentFee: 25_000,
        startedAt: new Date(),
        status: "UNLOCKING",
        totalFee: 25_000,
        userId: user.id,
      },
    });

    await handleMqttMessage("colokin/locker/99/detection", "EMPTY");

    await expect(
      prisma.rental.findUniqueOrThrow({ where: { id: rental.id } }),
    ).resolves.toMatchObject({
      status: "ACTIVE",
    });
    await expect(
      prisma.wallet.findUniqueOrThrow({ where: { id: wallet.id } }),
    ).resolves.toMatchObject({
      balance: 0,
    });
    await expect(
      prisma.walletTransaction.findFirstOrThrow({
        where: {
          referenceId: rental.id,
          referenceType: "RENTAL",
          type: "RENT_PAYMENT",
        },
      }),
    ).resolves.toMatchObject({
      amount: 25_000,
      direction: "DEBIT",
      status: "SUCCESS",
    });
    await expect(
      prisma.compartment.findUniqueOrThrow({ where: { id: compartment.id } }),
    ).resolves.toMatchObject({
      currentCableUnitId: null,
      lastSensorState: "CABLE_ABSENT",
      status: "EMPTY",
    });
  });

  it("activates an unlocking rental when the cable pickup event arrives after timeout", async () => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const user = await prisma.user.create({
      data: {
        email: `${testPrefix}-timeout-${unique}@example.com`,
        name: "IoT Bridge Timeout Test",
        passwordHash: "test",
        phone: `+62814${Date.now().toString().slice(-8)}`,
      },
    });
    const wallet = await prisma.wallet.create({
      data: {
        balance: 25_000,
        userId: user.id,
      },
    });
    const locker = await prisma.locker.create({
      data: {
        id: `${testPrefix}-timeout-locker-${unique}`,
        address: "MQTT timeout locker",
        lat: -6.89,
        lng: 107.61,
        name: "MQTT Timeout Locker",
      },
    });
    const compartment = await prisma.compartment.create({
      data: {
        id: `${testPrefix}-timeout-compartment-${unique}`,
        currentCableUnitId: `${testPrefix}-timeout-cable-${unique}`,
        lastSensorState: "CABLE_PRESENT",
        lockerId: locker.id,
        number: 99,
        status: "RENTED",
      },
    });
    const cableUnit = await prisma.cableUnit.create({
      data: {
        id: `${testPrefix}-timeout-cable-${unique}`,
        currentCompartmentId: compartment.id,
        currentLockerId: locker.id,
        serialNumber: `${testPrefix}-timeout-serial-${unique}`,
        specification: "Test cable",
        status: "RENTED",
      },
    });
    const rental = await prisma.rental.create({
      data: {
        cableUnitId: cableUnit.id,
        compartmentId: compartment.id,
        createdAt: new Date(Date.now() - 90_000),
        dueAt: new Date(Date.now() + 60 * 60 * 1000),
        durationMinutes: 60,
        lockerId: locker.id,
        rentFee: 25_000,
        startedAt: new Date(Date.now() - 90_000),
        status: "UNLOCKING",
        totalFee: 25_000,
        userId: user.id,
      },
    });

    await handleMqttMessage("colokin/locker/99/detection", "EMPTY");

    await expect(
      prisma.rental.findUniqueOrThrow({ where: { id: rental.id } }),
    ).resolves.toMatchObject({
      status: "ACTIVE",
    });
    await expect(
      prisma.wallet.findUniqueOrThrow({ where: { id: wallet.id } }),
    ).resolves.toMatchObject({
      balance: 0,
    });
    await expect(
      prisma.walletTransaction.count({
        where: {
          referenceId: rental.id,
          type: "REFUND",
        },
      }),
    ).resolves.toBe(0);
    await expect(
      prisma.compartment.findUniqueOrThrow({ where: { id: compartment.id } }),
    ).resolves.toMatchObject({
      currentCableUnitId: null,
      lastSensorState: "CABLE_ABSENT",
      status: "EMPTY",
    });
    await expect(
      prisma.cableUnit.findUniqueOrThrow({ where: { id: cableUnit.id } }),
    ).resolves.toMatchObject({
      currentCompartmentId: null,
      currentLockerId: null,
      status: "RENTED",
    });
  });

  it("fails an unlocking rental and restores stock when pickup succeeds but wallet is insufficient", async () => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const user = await prisma.user.create({
      data: {
        email: `${testPrefix}-insufficient-${unique}@example.com`,
        name: "IoT Bridge Insufficient Test",
        passwordHash: "test",
        phone: `+62815${Date.now().toString().slice(-8)}`,
      },
    });
    await prisma.wallet.create({
      data: {
        balance: 10_000,
        userId: user.id,
      },
    });
    const locker = await prisma.locker.create({
      data: {
        id: `${testPrefix}-insufficient-locker-${unique}`,
        address: "MQTT insufficient locker",
        lat: -6.89,
        lng: 107.61,
        name: "MQTT Insufficient Locker",
      },
    });
    const compartment = await prisma.compartment.create({
      data: {
        id: `${testPrefix}-insufficient-compartment-${unique}`,
        currentCableUnitId: `${testPrefix}-insufficient-cable-${unique}`,
        lastSensorState: "CABLE_PRESENT",
        lockerId: locker.id,
        number: 99,
        status: "RENTED",
      },
    });
    const cableUnit = await prisma.cableUnit.create({
      data: {
        id: `${testPrefix}-insufficient-cable-${unique}`,
        currentCompartmentId: compartment.id,
        currentLockerId: locker.id,
        serialNumber: `${testPrefix}-insufficient-serial-${unique}`,
        specification: "Test cable",
        status: "RENTED",
      },
    });
    const rental = await prisma.rental.create({
      data: {
        cableUnitId: cableUnit.id,
        compartmentId: compartment.id,
        dueAt: new Date(Date.now() + 60 * 60 * 1000),
        durationMinutes: 60,
        lockerId: locker.id,
        rentFee: 25_000,
        startedAt: new Date(),
        status: "UNLOCKING",
        totalFee: 25_000,
        userId: user.id,
      },
    });

    await handleMqttMessage("colokin/locker/99/detection", "EMPTY");

    await expect(
      prisma.rental.findUniqueOrThrow({ where: { id: rental.id } }),
    ).resolves.toMatchObject({
      status: "FAILED",
    });
    await expect(
      prisma.walletTransaction.count({
        where: {
          referenceId: rental.id,
          referenceType: "RENTAL",
        },
      }),
    ).resolves.toBe(0);
    await expect(
      prisma.compartment.findUniqueOrThrow({ where: { id: compartment.id } }),
    ).resolves.toMatchObject({
      currentCableUnitId: cableUnit.id,
      lastSensorState: "CABLE_PRESENT",
      status: "AVAILABLE",
    });
    await expect(
      prisma.cableUnit.findUniqueOrThrow({ where: { id: cableUnit.id } }),
    ).resolves.toMatchObject({
      currentCompartmentId: compartment.id,
      currentLockerId: locker.id,
      status: "AVAILABLE",
    });
  });
});
