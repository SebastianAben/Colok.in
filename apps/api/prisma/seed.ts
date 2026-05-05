import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";

const prisma = new PrismaClient();

const demoUserId = "usr_demo_001";
const demoWalletId = "wal_demo_001";
const demoLockerId = "lck_labtek_v_itb";

async function main() {
  const user = await prisma.user.upsert({
    where: { id: demoUserId },
    update: {
      name: "Jack Owidudu",
      phone: "+6281212345678",
      email: "mrjack@gmail.com",
      status: "ACTIVE",
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

  await prisma.notification.deleteMany({
    where: {
      userId: user.id,
    },
  });
  await prisma.topUp.deleteMany({
    where: {
      userId: user.id,
    },
  });
  await prisma.rental.deleteMany({
    where: {
      userId: user.id,
    },
  });
  await prisma.walletTransaction.deleteMany({
    where: {
      walletId: demoWalletId,
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

  await prisma.notification.upsert({
    where: { id: "ntf_demo_system_001" },
    update: {
      title: "Welcome to Colok.in",
      message: "Demo data is ready for rent, top up, and return flows.",
    },
    create: {
      id: "ntf_demo_system_001",
      userId: user.id,
      type: "SYSTEM",
      title: "Welcome to Colok.in",
      message: "Demo data is ready for rent, top up, and return flows.",
    },
  });

  await prisma.walletTransaction.upsert({
    where: { id: "wtx_demo_topup_001" },
    update: {
      amount: 100000,
      direction: "CREDIT",
      referenceId: "topup_demo_history_001",
      referenceType: "TOP_UP",
      status: "SUCCESS",
      type: "TOP_UP",
      walletId: demoWalletId,
    },
    create: {
      id: "wtx_demo_topup_001",
      walletId: demoWalletId,
      type: "TOP_UP",
      amount: 100000,
      direction: "CREDIT",
      status: "SUCCESS",
      referenceType: "TOP_UP",
      referenceId: "topup_demo_history_001",
      createdAt: new Date("2026-05-01T08:00:00.000Z"),
    },
  });

  await prisma.rental.upsert({
    where: { id: "rent_demo_returned_001" },
    update: {
      durationMinutes: 60,
      fine: 0,
      rentFee: 25000,
      returnedAt: new Date("2026-05-01T07:00:00.000Z"),
      status: "RETURNED",
      totalFee: 25000,
    },
    create: {
      id: "rent_demo_returned_001",
      userId: user.id,
      lockerId: locker.id,
      compartmentId: "cmp_labtek_v_003",
      cableUnitId: "cbl_labtek_v_003",
      status: "RETURNED",
      durationMinutes: 60,
      startedAt: new Date("2026-05-01T06:00:00.000Z"),
      dueAt: new Date("2026-05-01T07:00:00.000Z"),
      returnedAt: new Date("2026-05-01T07:00:00.000Z"),
      rentFee: 25000,
      fine: 0,
      totalFee: 25000,
    },
  });

  await prisma.notification.upsert({
    where: { id: "ntf_demo_topup_001" },
    update: {
      relatedTransactionId: "wtx_demo_topup_001",
      title: "Top Up Success",
      message: "Rp 100.000 has been added to your Colok.in wallet.",
    },
    create: {
      id: "ntf_demo_topup_001",
      userId: user.id,
      type: "TOP_UP_SUCCESS",
      title: "Top Up Success",
      message: "Rp 100.000 has been added to your Colok.in wallet.",
      relatedTransactionId: "wtx_demo_topup_001",
    },
  });

  await prisma.notification.upsert({
    where: { id: "ntf_demo_return_001" },
    update: {
      relatedRentalId: "rent_demo_returned_001",
      title: "Return Success",
      message: "You have successfully returned the extension cable at Labtek V ITB.",
    },
    create: {
      id: "ntf_demo_return_001",
      userId: user.id,
      type: "RETURN_SUCCESS",
      title: "Return Success",
      message: "You have successfully returned the extension cable at Labtek V ITB.",
      relatedRentalId: "rent_demo_returned_001",
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
