CREATE TYPE "RoleCode" AS ENUM ('CUSTOMER', 'MERCHANT_OPERATOR', 'OPERATIONS', 'COURIER');
CREATE TYPE "OrderStatus" AS ENUM ('SUBMITTED', 'PENDING_MERCHANT', 'CHANGE_PROPOSED', 'ACCEPTED', 'PREPARING', 'READY', 'FULFILLED', 'COMPLETED', 'CANCELLATION_REQUESTED', 'CANCELLED', 'REJECTED');
CREATE TYPE "PaymentMethod" AS ENUM ('CASH');
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'REPORTED', 'PROCESSING', 'CONFIRMED', 'FAILED', 'CANCELLED', 'REFUND_PENDING', 'PARTIALLY_REFUNDED', 'REFUNDED', 'CHARGEBACK');
CREATE TYPE "DeliveryStatus" AS ENUM ('REQUESTED', 'PENDING_ASSIGNMENT', 'OFFERED', 'ASSIGNED', 'READY_FOR_PICKUP', 'PICKUP_IN_PROGRESS', 'PICKED_UP', 'ON_THE_WAY', 'ARRIVED', 'DELIVERED', 'FAILED', 'CANCELLED');
CREATE TYPE "IdempotencyStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'FAILED');
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED');

CREATE TABLE "User" (
  "id" UUID NOT NULL,
  "email" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

CREATE TABLE "Merchant" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Merchant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Branch" (
  "id" UUID NOT NULL,
  "merchantId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "addressLine" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Branch_merchantId_idx" ON "Branch"("merchantId");

CREATE TABLE "RoleAssignment" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "role" "RoleCode" NOT NULL,
  "merchantId" UUID,
  "branchId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RoleAssignment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RoleAssignment_userId_role_idx" ON "RoleAssignment"("userId", "role");
CREATE INDEX "RoleAssignment_merchantId_idx" ON "RoleAssignment"("merchantId");
CREATE INDEX "RoleAssignment_branchId_idx" ON "RoleAssignment"("branchId");

CREATE TABLE "Product" (
  "id" UUID NOT NULL,
  "branchId" UUID NOT NULL,
  "sku" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "priceCents" INTEGER NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Product_branchId_sku_key" ON "Product"("branchId", "sku");
CREATE INDEX "Product_branchId_active_idx" ON "Product"("branchId", "active");

CREATE TABLE "Order" (
  "id" UUID NOT NULL,
  "branchId" UUID NOT NULL,
  "customerId" UUID NOT NULL,
  "status" "OrderStatus" NOT NULL,
  "version" INTEGER NOT NULL,
  "totalCents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'ARS',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Order_branchId_status_idx" ON "Order"("branchId", "status");
CREATE INDEX "Order_customerId_createdAt_idx" ON "Order"("customerId", "createdAt");

CREATE TABLE "OrderItem" (
  "id" UUID NOT NULL,
  "orderId" UUID NOT NULL,
  "productId" UUID,
  "skuSnapshot" TEXT NOT NULL,
  "nameSnapshot" TEXT NOT NULL,
  "unitPriceCents" INTEGER NOT NULL,
  "quantity" INTEGER NOT NULL,
  "lineTotalCents" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

CREATE TABLE "Payment" (
  "id" UUID NOT NULL,
  "orderId" UUID NOT NULL,
  "method" "PaymentMethod" NOT NULL,
  "status" "PaymentStatus" NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "version" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Payment_orderId_key" ON "Payment"("orderId");

CREATE TABLE "Delivery" (
  "id" UUID NOT NULL,
  "orderId" UUID NOT NULL,
  "status" "DeliveryStatus" NOT NULL,
  "version" INTEGER NOT NULL,
  "expectedCashCents" INTEGER NOT NULL,
  "pinHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Delivery_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Delivery_orderId_key" ON "Delivery"("orderId");
CREATE INDEX "Delivery_status_createdAt_idx" ON "Delivery"("status", "createdAt");

CREATE TABLE "CourierAssignment" (
  "id" UUID NOT NULL,
  "deliveryId" UUID NOT NULL,
  "courierId" UUID NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMP(3),
  CONSTRAINT "CourierAssignment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CourierAssignment_deliveryId_idx" ON "CourierAssignment"("deliveryId");
CREATE INDEX "CourierAssignment_courierId_idx" ON "CourierAssignment"("courierId");
CREATE UNIQUE INDEX "CourierAssignment_one_active_per_delivery" ON "CourierAssignment"("deliveryId") WHERE "active" = true;
CREATE UNIQUE INDEX "CourierAssignment_one_active_per_courier" ON "CourierAssignment"("courierId") WHERE "active" = true;

CREATE TABLE "IdempotencyRecord" (
  "id" UUID NOT NULL,
  "scope" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "status" "IdempotencyStatus" NOT NULL,
  "responseStatus" INTEGER,
  "responseBody" JSONB,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "IdempotencyRecord_scope_key_key" ON "IdempotencyRecord"("scope", "key");
CREATE INDEX "IdempotencyRecord_expiresAt_idx" ON "IdempotencyRecord"("expiresAt");

CREATE TABLE "AuditLog" (
  "id" UUID NOT NULL,
  "actorId" UUID,
  "action" TEXT NOT NULL,
  "aggregateType" TEXT NOT NULL,
  "aggregateId" UUID NOT NULL,
  "aggregateVersion" INTEGER,
  "metadata" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AuditLog_aggregateType_aggregateId_createdAt_idx" ON "AuditLog"("aggregateType", "aggregateId", "createdAt");
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

CREATE TABLE "OutboxEvent" (
  "id" UUID NOT NULL,
  "aggregateType" TEXT NOT NULL,
  "aggregateId" UUID NOT NULL,
  "aggregateVersion" INTEGER NOT NULL,
  "eventName" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedAt" TIMESTAMP(3),
  "processedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OutboxEvent_aggregateType_aggregateId_aggregateVersion_eventName_key" ON "OutboxEvent"("aggregateType", "aggregateId", "aggregateVersion", "eventName");
CREATE INDEX "OutboxEvent_status_availableAt_createdAt_idx" ON "OutboxEvent"("status", "availableAt", "createdAt");

CREATE TABLE "OutboxConsumerReceipt" (
  "id" UUID NOT NULL,
  "consumerName" TEXT NOT NULL,
  "eventId" UUID NOT NULL,
  "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OutboxConsumerReceipt_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OutboxConsumerReceipt_consumerName_eventId_key" ON "OutboxConsumerReceipt"("consumerName", "eventId");
CREATE INDEX "OutboxConsumerReceipt_eventId_idx" ON "OutboxConsumerReceipt"("eventId");

ALTER TABLE "Branch" ADD CONSTRAINT "Branch_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RoleAssignment" ADD CONSTRAINT "RoleAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoleAssignment" ADD CONSTRAINT "RoleAssignment_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoleAssignment" ADD CONSTRAINT "RoleAssignment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Product" ADD CONSTRAINT "Product_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CourierAssignment" ADD CONSTRAINT "CourierAssignment_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CourierAssignment" ADD CONSTRAINT "CourierAssignment_courierId_fkey" FOREIGN KEY ("courierId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OutboxConsumerReceipt" ADD CONSTRAINT "OutboxConsumerReceipt_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "OutboxEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE FUNCTION reject_audit_log_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog is append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "AuditLog_reject_update" BEFORE UPDATE ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION reject_audit_log_mutation();
CREATE TRIGGER "AuditLog_reject_delete" BEFORE DELETE ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION reject_audit_log_mutation();
