CREATE TABLE "AuthLoginThrottle" (
    "sourceHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "windowStartedAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthLoginThrottle_pkey" PRIMARY KEY ("sourceHash")
);
