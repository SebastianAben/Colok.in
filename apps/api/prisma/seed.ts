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
