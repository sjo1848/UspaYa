import { getPrismaClient } from '../src/client';

const prisma = getPrismaClient();

const ids = {
  customer: '11111111-1111-4111-8111-111111111111',
  merchantOperator: '22222222-2222-4222-8222-222222222222',
  operations: '33333333-3333-4333-8333-333333333333',
  courier: '44444444-4444-4444-8444-444444444444',
  merchant: '55555555-5555-4555-8555-555555555555',
  branch: '66666666-6666-4666-8666-666666666666',
  productOne: '77777777-7777-4777-8777-777777777777',
  productTwo: '88888888-8888-4888-8888-888888888888',
};

async function seed(): Promise<void> {
  await prisma.user.upsert({
    where: { id: ids.customer },
    update: {},
    create: { id: ids.customer, email: 'customer@uspaya.test', displayName: 'Cliente Piloto' },
  });
  await prisma.user.upsert({
    where: { id: ids.merchantOperator },
    update: {},
    create: {
      id: ids.merchantOperator,
      email: 'merchant@uspaya.test',
      displayName: 'Operador Comercio',
    },
  });
  await prisma.user.upsert({
    where: { id: ids.operations },
    update: {},
    create: {
      id: ids.operations,
      email: 'operations@uspaya.test',
      displayName: 'Coordinación UspaYa',
    },
  });
  await prisma.user.upsert({
    where: { id: ids.courier },
    update: {},
    create: { id: ids.courier, email: 'courier@uspaya.test', displayName: 'Repartidor Piloto' },
  });

  await prisma.merchant.upsert({
    where: { id: ids.merchant },
    update: {},
    create: { id: ids.merchant, name: 'Comercio Piloto' },
  });
  await prisma.branch.upsert({
    where: { id: ids.branch },
    update: {},
    create: {
      id: ids.branch,
      merchantId: ids.merchant,
      name: 'Sucursal Centro',
      addressLine: 'Uspallata centro',
    },
  });

  await prisma.product.upsert({
    where: { id: ids.productOne },
    update: {},
    create: {
      id: ids.productOne,
      branchId: ids.branch,
      sku: 'PILOT-001',
      name: 'Producto Piloto A',
      priceCents: 450000,
    },
  });
  await prisma.product.upsert({
    where: { id: ids.productTwo },
    update: {},
    create: {
      id: ids.productTwo,
      branchId: ids.branch,
      sku: 'PILOT-002',
      name: 'Producto Piloto B',
      priceCents: 275000,
    },
  });

  const roleAssignments = [
    {
      id: '91111111-1111-4111-8111-111111111111',
      userId: ids.customer,
      role: 'CUSTOMER' as const,
    },
    {
      id: '92222222-2222-4222-8222-222222222222',
      userId: ids.merchantOperator,
      role: 'MERCHANT_OPERATOR' as const,
      merchantId: ids.merchant,
      branchId: ids.branch,
    },
    {
      id: '93333333-3333-4333-8333-333333333333',
      userId: ids.operations,
      role: 'OPERATIONS' as const,
    },
    {
      id: '94444444-4444-4444-8444-444444444444',
      userId: ids.courier,
      role: 'COURIER' as const,
    },
  ];

  for (const assignment of roleAssignments) {
    await prisma.roleAssignment.upsert({
      where: { id: assignment.id },
      update: {},
      create: assignment,
    });
  }
}

seed()
  .then(async () => prisma.$disconnect())
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exitCode = 1;
  });
