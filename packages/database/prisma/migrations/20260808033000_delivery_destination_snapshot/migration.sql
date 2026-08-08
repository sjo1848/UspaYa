ALTER TABLE "Delivery"
  ADD COLUMN "destinationAddressText" TEXT,
  ADD COLUMN "destinationPhone" TEXT,
  ADD COLUMN "destinationReference" TEXT,
  ADD COLUMN "destinationLodging" TEXT,
  ADD COLUMN "destinationLatitude" DOUBLE PRECISION,
  ADD COLUMN "destinationLongitude" DOUBLE PRECISION;
