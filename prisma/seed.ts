import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...\n");

  // Moneda base (requerida por el sistema)
  await db.currency.upsert({
    where: { code: "USD" },
    update: {},
    create: {
      code: "USD",
      name: "Dólar Estadounidense",
      symbol: "$",
      isBase: true,
    },
  });

  // Sucursal principal (requerida para caja, ventas, etc.)
  const branch = await db.branch.upsert({
    where: { code: "SUC-001" },
    update: {},
    create: {
      name: "Sucursal Principal",
      code: "SUC-001",
      isMain: true,
      active: true,
    },
  });

  // Admin
  const admin = await db.user.upsert({
    where: { email: "admin@admin.com" },
    update: {},
    create: {
      name: "Administrador",
      email: "admin@admin.com",
      password: "admin123",
      role: "admin",
      active: true,
      branchId: branch.id,
    },
  });

  console.log(`✅ Moneda base: USD ($)`);
  console.log(`✅ Sucursal: ${branch.name} (${branch.id})`);
  console.log(`✅ Admin creado: ${admin.name} (${admin.email})`);
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });