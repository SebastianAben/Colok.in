-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DELETED');

-- CreateEnum
CREATE TYPE "LockerStatus" AS ENUM ('ONLINE', 'OFFLINE', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "CompartmentStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'RENTED', 'EMPTY', 'RETURN_OPEN', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "SensorState" AS ENUM ('CABLE_PRESENT', 'CABLE_ABSENT', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "CableUnitStatus" AS ENUM ('AVAILABLE', 'RENTED', 'LOST', 'DAMAGED', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "RentalStatus" AS ENUM ('DRAFT', 'UNLOCKING', 'ACTIVE', 'RETURN_REQUESTED', 'WAITING_FOR_SENSOR', 'RETURNED', 'LATE', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "ReturnSessionStatus" AS ENUM ('READY_TO_RETURN', 'LOCKER_OPENING', 'WAITING_FOR_SENSOR', 'VERIFIED', 'TIMEOUT', 'FAILED');

-- CreateEnum
CREATE TYPE "TopUpStatus" AS ENUM ('PENDING', 'SUCCESS', 'EXPIRED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WalletTransactionType" AS ENUM ('TOP_UP', 'RENT_PAYMENT', 'FINE_PAYMENT', 'REFUND');

-- CreateEnum
CREATE TYPE "WalletTransactionDirection" AS ENUM ('CREDIT', 'DEBIT');

-- CreateEnum
CREATE TYPE "WalletTransactionStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('RENT_SUCCESS', 'RETURN_SUCCESS', 'TOP_UP_SUCCESS', 'RENT_REMINDER', 'LATE_WARNING', 'SYSTEM');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "passwordHash" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wallet" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'IDR',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletTransaction" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "type" "WalletTransactionType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "direction" "WalletTransactionDirection" NOT NULL,
    "status" "WalletTransactionStatus" NOT NULL,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Locker" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "lat" DECIMAL(9,6) NOT NULL,
    "lng" DECIMAL(9,6) NOT NULL,
    "status" "LockerStatus" NOT NULL DEFAULT 'ONLINE',
    "operationalHours" TEXT NOT NULL DEFAULT '24/7',
    "lastHeartbeatAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Locker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Compartment" (
    "id" TEXT NOT NULL,
    "lockerId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "status" "CompartmentStatus" NOT NULL DEFAULT 'AVAILABLE',
    "currentCableUnitId" TEXT,
    "lastSensorState" "SensorState" NOT NULL DEFAULT 'UNKNOWN',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Compartment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CableUnit" (
    "id" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "status" "CableUnitStatus" NOT NULL DEFAULT 'AVAILABLE',
    "specification" TEXT NOT NULL,
    "isSniCertified" BOOLEAN NOT NULL DEFAULT true,
    "hasOverloadProtection" BOOLEAN NOT NULL DEFAULT true,
    "currentLockerId" TEXT,
    "currentCompartmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CableUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rental" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lockerId" TEXT NOT NULL,
    "compartmentId" TEXT NOT NULL,
    "cableUnitId" TEXT NOT NULL,
    "status" "RentalStatus" NOT NULL DEFAULT 'DRAFT',
    "durationMinutes" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "returnedAt" TIMESTAMP(3),
    "rentFee" INTEGER NOT NULL,
    "fine" INTEGER NOT NULL DEFAULT 0,
    "totalFee" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rental_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReturnSession" (
    "id" TEXT NOT NULL,
    "rentalId" TEXT NOT NULL,
    "returnLockerId" TEXT NOT NULL,
    "returnCompartmentId" TEXT NOT NULL,
    "status" "ReturnSessionStatus" NOT NULL DEFAULT 'READY_TO_RETURN',
    "openedAt" TIMESTAMP(3),
    "sensorTimeoutAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReturnSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TopUp" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "TopUpStatus" NOT NULL DEFAULT 'PENDING',
    "dummyQrPayload" TEXT NOT NULL,
    "dummyQrTokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "walletTransactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TopUp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "relatedTransactionId" TEXT,
    "relatedRentalId" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_userId_key" ON "Wallet"("userId");

-- CreateIndex
CREATE INDEX "WalletTransaction_walletId_createdAt_idx" ON "WalletTransaction"("walletId", "createdAt");

-- CreateIndex
CREATE INDEX "Compartment_lockerId_status_idx" ON "Compartment"("lockerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Compartment_lockerId_number_key" ON "Compartment"("lockerId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "CableUnit_serialNumber_key" ON "CableUnit"("serialNumber");

-- CreateIndex
CREATE INDEX "CableUnit_currentLockerId_status_idx" ON "CableUnit"("currentLockerId", "status");

-- CreateIndex
CREATE INDEX "Rental_userId_status_idx" ON "Rental"("userId", "status");

-- CreateIndex
CREATE INDEX "TopUp_userId_status_idx" ON "TopUp"("userId", "status");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Compartment" ADD CONSTRAINT "Compartment_lockerId_fkey" FOREIGN KEY ("lockerId") REFERENCES "Locker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CableUnit" ADD CONSTRAINT "CableUnit_currentLockerId_fkey" FOREIGN KEY ("currentLockerId") REFERENCES "Locker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CableUnit" ADD CONSTRAINT "CableUnit_currentCompartmentId_fkey" FOREIGN KEY ("currentCompartmentId") REFERENCES "Compartment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rental" ADD CONSTRAINT "Rental_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rental" ADD CONSTRAINT "Rental_lockerId_fkey" FOREIGN KEY ("lockerId") REFERENCES "Locker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rental" ADD CONSTRAINT "Rental_compartmentId_fkey" FOREIGN KEY ("compartmentId") REFERENCES "Compartment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rental" ADD CONSTRAINT "Rental_cableUnitId_fkey" FOREIGN KEY ("cableUnitId") REFERENCES "CableUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnSession" ADD CONSTRAINT "ReturnSession_rentalId_fkey" FOREIGN KEY ("rentalId") REFERENCES "Rental"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnSession" ADD CONSTRAINT "ReturnSession_returnLockerId_fkey" FOREIGN KEY ("returnLockerId") REFERENCES "Locker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnSession" ADD CONSTRAINT "ReturnSession_returnCompartmentId_fkey" FOREIGN KEY ("returnCompartmentId") REFERENCES "Compartment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopUp" ADD CONSTRAINT "TopUp_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopUp" ADD CONSTRAINT "TopUp_walletTransactionId_fkey" FOREIGN KEY ("walletTransactionId") REFERENCES "WalletTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
