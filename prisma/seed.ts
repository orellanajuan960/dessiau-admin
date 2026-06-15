import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...\n");

  // ─────────────────────────────────────────────
  // 0. CLEAN EXISTING DATA (order respects FK constraints)
  // ─────────────────────────────────────────────
  console.log("0️⃣  Cleaning existing data...");
  const deleteOrder = [
    "SalePayment",
    "SaleLine",
    "AccountReceivable",
    "Sale",
    "CashMovement",
    "CashCut",
    "CashRegister",
    "Expense",
    "InventoryAdjustment",
    "PurchaseLine",
    "AccountPayable",
    "Purchase",
    "Inventory",
    "RecipeComponent",
    "Product",
    "Client",
    "Supplier",
    "User",
    "ExchangeRate",
    "Category",
    "Currency",
  ] as const;

  for (const model of deleteOrder) {
    // @ts-expect-error - dynamic model name for cleanup
    await db[model].deleteMany();
  }
  console.log("   ✓ All existing data cleared\n");

  // ─────────────────────────────────────────────
  // 1. CURRENCIES
  // ─────────────────────────────────────────────
  console.log("1️⃣  Creating currencies...");
  const usd = await db.currency.create({
    data: {
      code: "USD",
      name: "Dólar Estadounidense",
      symbol: "$",
      isBase: true,
    },
  });
  const ves = await db.currency.create({
    data: {
      code: "VES",
      name: "Bolívar Venezolano",
      symbol: "Bs.",
      isBase: false,
    },
  });
  console.log(`   ✓ USD (${usd.id})`);
  console.log(`   ✓ VES (${ves.id})`);

  // ─────────────────────────────────────────────
  // 2. EXCHANGE RATE
  // ─────────────────────────────────────────────
  console.log("2️⃣  Creating exchange rate...");
  const exchangeRate = await db.exchangeRate.create({
    data: {
      fromCurrencyId: usd.id,
      toCurrencyId: ves.id,
      rate: 36.5,
      date: new Date(),
    },
  });
  console.log(`   ✓ 1 USD = 36.50 VES`);

  // ─────────────────────────────────────────────
  // 3. CATEGORIES
  // ─────────────────────────────────────────────
  console.log("3️⃣  Creating categories...");
  const catAlimentos = await db.category.create({
    data: { name: "Alimentos" },
  });
  const catBebidas = await db.category.create({
    data: { name: "Bebidas" },
  });
  const catCombos = await db.category.create({
    data: { name: "Combos" },
  });
  console.log(`   ✓ Alimentos (${catAlimentos.id})`);
  console.log(`   ✓ Bebidas (${catBebidas.id})`);
  console.log(`   ✓ Combos (${catCombos.id})`);

  // ─────────────────────────────────────────────
  // 4. USERS
  // ─────────────────────────────────────────────
  console.log("4️⃣  Creating users...");
  const admin = await db.user.create({
    data: {
      name: "Carlos Garcia",
      email: "carlos@sistema.com",
      password: "admin123",
      role: "admin",
      active: true,
    },
  });
  const cajera = await db.user.create({
    data: {
      name: "Maria Lopez",
      email: "maria@sistema.com",
      password: "cajera123",
      role: "cajero",
      active: true,
    },
  });
  const vendedor = await db.user.create({
    data: {
      name: "Jose Rodriguez",
      email: "jose@sistema.com",
      password: "vendedor123",
      role: "vendedor",
      active: true,
    },
  });
  console.log(`   ✓ Admin: Carlos Garcia (${admin.id})`);
  console.log(`   ✓ Cajera: Maria Lopez (${cajera.id})`);
  console.log(`   ✓ Vendedor: Jose Rodriguez (${vendedor.id})`);

  // ─────────────────────────────────────────────
  // 5. SUPPLIERS
  // ─────────────────────────────────────────────
  console.log("5️⃣  Creating suppliers...");
  const supplier1 = await db.supplier.create({
    data: {
      name: "Distribuidora Alimentos C.A.",
      rif: "J-12345678-9",
      phone: "+58 212-555-0101",
      email: "contacto@distribuidoraalimentos.com",
      address: "Av. Principal, Edif. Comercio, Piso 3, Caracas",
      balance: 0,
    },
  });
  const supplier2 = await db.supplier.create({
    data: {
      name: "Bebidas del Sur",
      rif: "J-98765432-1",
      phone: "+58 212-555-0202",
      email: "ventas@bebidasdelsur.com",
      address: "Cc. Parque Central, Local 45, Caracas",
      balance: 0,
    },
  });
  console.log(`   ✓ ${supplier1.name} (${supplier1.id})`);
  console.log(`   ✓ ${supplier2.name} (${supplier2.id})`);

  // ─────────────────────────────────────────────
  // 6. PRODUCTS
  // ─────────────────────────────────────────────
  console.log("6️⃣  Creating products...");

  const empanada = await db.product.create({
    data: {
      name: "Empanada de carne",
      sku: "EMP-001",
      type: "simple",
      costAvg: 0.4,
      price: 1.5,
      currencyId: usd.id,
      categoryId: catAlimentos.id,
      active: true,
    },
  });

  const arepa = await db.product.create({
    data: {
      name: "Arepa reina pepiada",
      sku: "ARE-001",
      type: "simple",
      costAvg: 0.6,
      price: 2.0,
      currencyId: usd.id,
      categoryId: catAlimentos.id,
      active: true,
    },
  });

  const cachapa = await db.product.create({
    data: {
      name: "Cachapa con queso",
      sku: "CAC-001",
      type: "simple",
      costAvg: 0.8,
      price: 2.5,
      currencyId: usd.id,
      categoryId: catAlimentos.id,
      active: true,
    },
  });

  const tequeno = await db.product.create({
    data: {
      name: "Tequeño",
      sku: "TEQ-001",
      type: "simple",
      costAvg: 0.3,
      price: 1.0,
      currencyId: usd.id,
      categoryId: catAlimentos.id,
      active: true,
    },
  });

  const jugo = await db.product.create({
    data: {
      name: "Jugo de naranja",
      sku: "JUG-001",
      type: "simple",
      costAvg: 0.25,
      price: 1.2,
      currencyId: usd.id,
      categoryId: catBebidas.id,
      active: true,
    },
  });

  const cafe = await db.product.create({
    data: {
      name: "Café americano",
      sku: "CAF-001",
      type: "simple",
      costAvg: 0.15,
      price: 0.8,
      currencyId: usd.id,
      categoryId: catBebidas.id,
      active: true,
    },
  });

  const cerveza = await db.product.create({
    data: {
      name: "Cerveza Polar",
      sku: "CER-001",
      type: "simple",
      costAvg: 0.35,
      price: 1.5,
      currencyId: usd.id,
      categoryId: catBebidas.id,
      active: true,
    },
  });

  const comboAlmuerzo = await db.product.create({
    data: {
      name: "Combo Almuerzo",
      sku: "COM-001",
      type: "compuesto",
      costAvg: 0.85,
      price: 3.0,
      currencyId: usd.id,
      categoryId: catCombos.id,
      active: true,
    },
  });

  console.log(`   ✓ ${empanada.name} (${empanada.id})`);
  console.log(`   ✓ ${arepa.name} (${arepa.id})`);
  console.log(`   ✓ ${cachapa.name} (${cachapa.id})`);
  console.log(`   ✓ ${tequeno.name} (${tequeno.id})`);
  console.log(`   ✓ ${jugo.name} (${jugo.id})`);
  console.log(`   ✓ ${cafe.name} (${cafe.id})`);
  console.log(`   ✓ ${cerveza.name} (${cerveza.id})`);
  console.log(`   ✓ ${comboAlmuerzo.name} (${comboAlmuerzo.id})`);

  // ─────────────────────────────────────────────
  // 6b. RECIPE COMPONENTS (Combo Almuerzo)
  // ─────────────────────────────────────────────
  console.log("6b️⃣ Creating recipe components...");
  await db.recipeComponent.create({
    data: {
      productId: comboAlmuerzo.id,
      componentId: arepa.id,
      quantity: 1,
      unit: "unidad",
    },
  });
  await db.recipeComponent.create({
    data: {
      productId: comboAlmuerzo.id,
      componentId: jugo.id,
      quantity: 1,
      unit: "unidad",
    },
  });
  console.log(`   ✓ Combo Almuerzo → Arepa (1) + Jugo de naranja (1)`);

  // ─────────────────────────────────────────────
  // 7. INVENTORY
  // ─────────────────────────────────────────────
  console.log("7️⃣  Creating inventory entries...");
  const branchId = "sucursal-1";

  const inventoryData = [
    { product: empanada, stock: 200, minStock: 20 },
    { product: arepa, stock: 100, minStock: 15 },
    { product: cachapa, stock: 80, minStock: 10 },
    { product: tequeno, stock: 150, minStock: 25 },
    { product: jugo, stock: 120, minStock: 10 },
    { product: cafe, stock: 200, minStock: 20 },
    { product: cerveza, stock: 100, minStock: 15 },
    { product: comboAlmuerzo, stock: 50, minStock: 10 },
  ];

  const inventories: Map<string, number> = new Map();
  for (const inv of inventoryData) {
    const created = await db.inventory.create({
      data: {
        productId: inv.product.id,
        branchId,
        stock: inv.stock,
        minStock: inv.minStock,
      },
    });
    inventories.set(inv.product.id, inv.stock);
    console.log(
      `   ✓ ${inv.product.name}: stock=${inv.stock}, minStock=${inv.minStock}`
    );
  }

  // ─────────────────────────────────────────────
  // 8. CLIENTS
  // ─────────────────────────────────────────────
  console.log("8️⃣  Creating clients...");
  const client1 = await db.client.create({
    data: {
      name: "Maria Fernandez",
      phone: "+58 412-555-1001",
      email: "maria.fernandez@email.com",
      address: "Urbanización El Paraíso, Caracas",
    },
  });
  const client2 = await db.client.create({
    data: {
      name: "Pedro Martinez",
      phone: "+58 414-555-1002",
      email: "pedro.martinez@email.com",
      address: "Los Caobos, Caracas",
    },
  });
  const client3 = await db.client.create({
    data: {
      name: "Ana Torres",
      phone: "+58 416-555-1003",
      email: "ana.torres@email.com",
      address: "La California, Caracas",
    },
  });
  const client4 = await db.client.create({
    data: {
      name: "Luis Herrera",
      phone: "+58 424-555-1004",
      email: "luis.herrera@email.com",
      address: "Sabana Grande, Caracas",
    },
  });
  const client5 = await db.client.create({
    data: {
      name: "Carmen Ruiz",
      phone: "+58 426-555-1005",
      email: "carmen.ruiz@email.com",
      address: "Chapultepec, Caracas",
    },
  });
  console.log(`   ✓ ${client1.name} (${client1.id})`);
  console.log(`   ✓ ${client2.name} (${client2.id})`);
  console.log(`   ✓ ${client3.name} (${client3.id})`);
  console.log(`   ✓ ${client4.name} (${client4.id})`);
  console.log(`   ✓ ${client5.name} (${client5.id})`);

  // ─────────────────────────────────────────────
  // 11. CASH REGISTER (before sales, so sales can reference it)
  // ─────────────────────────────────────────────
  console.log("11️⃣ Creating cash register...");
  const cashReg = await db.cashRegister.create({
    data: {
      userId: admin.id,
      branchId,
      openingDate: new Date(),
      initialAmt: 200.0,
      currentAmt: 200.0,
      status: "abierta",
    },
  });
  console.log(`   ✓ Cash register opened by Carlos Garcia, initial $200.00 USD (${cashReg.id})`);

  // ─────────────────────────────────────────────
  // 9. SALES
  // ─────────────────────────────────────────────
  console.log("9️⃣  Creating sales...");

  // Sale 1: 3 empanadas + 2 jugos = 3*1.50 + 2*1.20 = 4.50 + 2.40 = 6.90 USD
  const sale1Total = 3 * 1.5 + 2 * 1.2;
  const sale1 = await db.sale.create({
    data: {
      clientId: client1.id,
      cashRegId: cashReg.id,
      userId: cajera.id,
      branchId,
      date: new Date(),
      total: sale1Total,
      status: "completada",
    },
  });
  await db.saleLine.create({
    data: {
      saleId: sale1.id,
      productId: empanada.id,
      quantity: 3,
      unitPrice: empanada.price,
      unitCost: empanada.costAvg,
      lineTotal: 3 * empanada.price,
      lineProfit: 3 * (empanada.price - empanada.costAvg),
    },
  });
  await db.saleLine.create({
    data: {
      saleId: sale1.id,
      productId: jugo.id,
      quantity: 2,
      unitPrice: jugo.price,
      unitCost: jugo.costAvg,
      lineTotal: 2 * jugo.price,
      lineProfit: 2 * (jugo.price - jugo.costAvg),
    },
  });
  await db.salePayment.create({
    data: {
      saleId: sale1.id,
      method: "efectivo",
      amount: sale1Total,
      currencyId: usd.id,
    },
  });
  console.log(
    `   ✓ Sale 1: 3 empanadas + 2 jugos = $${sale1Total.toFixed(2)} USD (cash)`
  );

  // Sale 2: 1 cachapa + 1 café + 1 cerveza = 2.50 + 0.80 + 1.50 = 4.80 USD
  const sale2Total = 2.5 + 0.8 + 1.5;
  const sale2 = await db.sale.create({
    data: {
      clientId: client2.id,
      cashRegId: cashReg.id,
      userId: cajera.id,
      branchId,
      date: new Date(),
      total: sale2Total,
      status: "completada",
    },
  });
  await db.saleLine.create({
    data: {
      saleId: sale2.id,
      productId: cachapa.id,
      quantity: 1,
      unitPrice: cachapa.price,
      unitCost: cachapa.costAvg,
      lineTotal: 1 * cachapa.price,
      lineProfit: 1 * (cachapa.price - cachapa.costAvg),
    },
  });
  await db.saleLine.create({
    data: {
      saleId: sale2.id,
      productId: cafe.id,
      quantity: 1,
      unitPrice: cafe.price,
      unitCost: cafe.costAvg,
      lineTotal: 1 * cafe.price,
      lineProfit: 1 * (cafe.price - cafe.costAvg),
    },
  });
  await db.saleLine.create({
    data: {
      saleId: sale2.id,
      productId: cerveza.id,
      quantity: 1,
      unitPrice: cerveza.price,
      unitCost: cerveza.costAvg,
      lineTotal: 1 * cerveza.price,
      lineProfit: 1 * (cerveza.price - cerveza.costAvg),
    },
  });
  await db.salePayment.create({
    data: {
      saleId: sale2.id,
      method: "tarjeta",
      amount: sale2Total,
      currencyId: usd.id,
      reference: "POS-00001",
    },
  });
  console.log(
    `   ✓ Sale 2: 1 cachapa + 1 café + 1 cerveza = $${sale2Total.toFixed(2)} USD (card)`
  );

  // Sale 3: 5 tequeños + 2 cervezas = 5*1.00 + 2*1.50 = 5.00 + 3.00 = 8.00 USD
  const sale3Total = 5 * 1.0 + 2 * 1.5;
  const sale3 = await db.sale.create({
    data: {
      clientId: client3.id,
      cashRegId: cashReg.id,
      userId: vendedor.id,
      branchId,
      date: new Date(),
      total: sale3Total,
      status: "completada",
    },
  });
  await db.saleLine.create({
    data: {
      saleId: sale3.id,
      productId: tequeno.id,
      quantity: 5,
      unitPrice: tequeno.price,
      unitCost: tequeno.costAvg,
      lineTotal: 5 * tequeno.price,
      lineProfit: 5 * (tequeno.price - tequeno.costAvg),
    },
  });
  await db.saleLine.create({
    data: {
      saleId: sale3.id,
      productId: cerveza.id,
      quantity: 2,
      unitPrice: cerveza.price,
      unitCost: cerveza.costAvg,
      lineTotal: 2 * cerveza.price,
      lineProfit: 2 * (cerveza.price - cerveza.costAvg),
    },
  });
  await db.salePayment.create({
    data: {
      saleId: sale3.id,
      method: "efectivo",
      amount: sale3Total,
      currencyId: usd.id,
    },
  });
  console.log(
    `   ✓ Sale 3: 5 tequeños + 2 cervezas = $${sale3Total.toFixed(2)} USD (cash)`
  );

  // ─────────────────────────────────────────────
  // 10. PURCHASES
  // ─────────────────────────────────────────────
  console.log("10️⃣ Creating purchases...");

  // Purchase 1 from Distribuidora: 100 empanadas, 50 arepas, 200 tequeños
  const p1Lines = [
    { productId: empanada.id, qty: 100, cost: 0.4 },
    { productId: arepa.id, qty: 50, cost: 0.6 },
    { productId: tequeno.id, qty: 200, cost: 0.3 },
  ];
  const p1Total = p1Lines.reduce(
    (sum, l) => sum + l.qty * l.cost,
    0
  );
  const purchase1 = await db.purchase.create({
    data: {
      supplierId: supplier1.id,
      branchId,
      date: new Date(),
      total: p1Total,
      status: "recibida",
      currencyId: usd.id,
    },
  });
  for (const line of p1Lines) {
    await db.purchaseLine.create({
      data: {
        purchaseId: purchase1.id,
        productId: line.productId,
        quantity: line.qty,
        unitCost: line.cost,
        subtotal: line.qty * line.cost,
      },
    });
  }
  console.log(
    `   ✓ Purchase 1: ${p1Lines.map((l) => `${l.qty} units`).join(", ")} from ${supplier1.name} = $${p1Total.toFixed(2)} USD`
  );

  // Purchase 2 from Bebidas del Sur: 50 jugos, 100 cervezas
  const p2Lines = [
    { productId: jugo.id, qty: 50, cost: 0.25 },
    { productId: cerveza.id, qty: 100, cost: 0.35 },
  ];
  const p2Total = p2Lines.reduce(
    (sum, l) => sum + l.qty * l.cost,
    0
  );
  const purchase2 = await db.purchase.create({
    data: {
      supplierId: supplier2.id,
      branchId,
      date: new Date(),
      total: p2Total,
      status: "recibida",
      currencyId: usd.id,
    },
  });
  for (const line of p2Lines) {
    await db.purchaseLine.create({
      data: {
        purchaseId: purchase2.id,
        productId: line.productId,
        quantity: line.qty,
        unitCost: line.cost,
        subtotal: line.qty * line.cost,
      },
    });
  }
  console.log(
    `   ✓ Purchase 2: ${p2Lines.map((l) => `${l.qty} units`).join(", ")} from ${supplier2.name} = $${p2Total.toFixed(2)} USD`
  );

  // ─────────────────────────────────────────────
  // 12. CASH MOVEMENTS
  // ─────────────────────────────────────────────
  console.log("12️⃣ Creating cash movements...");

  // Opening movement: +$200
  await db.cashMovement.create({
    data: {
      cashRegId: cashReg.id,
      userId: admin.id,
      type: "apertura",
      amount: 200.0,
      concept: "Apertura de caja",
      currencyId: usd.id,
    },
  });
  console.log("   ✓ Opening: +$200.00 USD");

  // Expense payment: -$50
  await db.cashMovement.create({
    data: {
      cashRegId: cashReg.id,
      userId: admin.id,
      type: "egreso",
      amount: 50.0,
      concept: "Pago de gasto parcial",
      currencyId: usd.id,
    },
  });
  console.log("   ✓ Expense payment: -$50.00 USD");

  // Update cash register current amount: 200 + 6.90 + 8.00 (cash sales) - 50 = 164.90
  const totalCashSales = sale1Total + sale3Total; // card sale doesn't add to cash
  await db.cashRegister.update({
    where: { id: cashReg.id },
    data: {
      currentAmt: 200.0 + totalCashSales - 50.0,
    },
  });
  console.log(
    `   ✓ Cash register current: $${(200.0 + totalCashSales - 50.0).toFixed(2)} USD`
  );

  // ─────────────────────────────────────────────
  // 13. EXPENSES
  // ─────────────────────────────────────────────
  console.log("13️⃣ Creating expenses...");
  await db.expense.create({
    data: {
      branchId,
      category: "Alquiler",
      description: "Alquiler del local comercial - Julio 2025",
      amount: 200.0,
      currencyId: usd.id,
      userId: admin.id,
      date: new Date(),
    },
  });
  await db.expense.create({
    data: {
      branchId,
      category: "Servicios",
      description: "Servicios públicos (electricidad, agua, internet)",
      amount: 45.0,
      currencyId: usd.id,
      userId: admin.id,
      date: new Date(),
    },
  });
  await db.expense.create({
    data: {
      branchId,
      category: "Insumos",
      description: "Compra de insumos y materiales de empaque",
      amount: 30.0,
      currencyId: usd.id,
      userId: admin.id,
      date: new Date(),
    },
  });
  console.log("   ✓ Alquiler local: $200.00 USD");
  console.log("   ✓ Servicios: $45.00 USD");
  console.log("   ✓ Insumos: $30.00 USD");

  // ─────────────────────────────────────────────
  // SUMMARY
  // ─────────────────────────────────────────────
  console.log("\n✅ Seed completed successfully!\n");
  console.log("📊 Summary:");
  console.log(`   Currencies:      2`);
  console.log(`   Exchange Rates:  1`);
  console.log(`   Categories:      3`);
  console.log(`   Users:           3`);
  console.log(`   Suppliers:       2`);
  console.log(`   Products:        8 (7 simple + 1 combo)`);
  console.log(`   Recipes:         1 (Combo Almuerzo)`);
  console.log(`   Inventory:       8 entries`);
  console.log(`   Clients:         5`);
  console.log(`   Sales:           3`);
  console.log(`   Sale Lines:      7`);
  console.log(`   Payments:        3`);
  console.log(`   Purchases:       2`);
  console.log(`   Purchase Lines:  5`);
  console.log(`   Cash Registers:  1`);
  console.log(`   Cash Movements:  2`);
  console.log(`   Expenses:        3`);
  console.log(`   Total records:   ~55`);
  console.log("");
  console.log("🎉 Database is ready for demo!");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
