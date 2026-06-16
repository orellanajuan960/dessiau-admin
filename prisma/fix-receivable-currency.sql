-- Fix AccountReceivable.currencyId to match the actual payment currency
-- Run this AFTER the code changes are deployed

-- 1. Fix receivables where currencyId is empty or wrong
-- Match to the credit payment's currency
UPDATE "AccountReceivable" ar
SET "currencyId" = sp."currencyId"
FROM "SalePayment" sp
WHERE ar."saleId" = sp."saleId"
  AND sp."method" IN (SELECT code FROM "PaymentMethod" WHERE "isCredit" = true)
  AND (ar."currencyId" IS NULL OR ar."currencyId" = '');

-- 2. For receivables from dispatches (no credit payment), use the first sale line's product currency
UPDATE "AccountReceivable" ar
SET "currencyId" = p."currencyId"
FROM "SaleLine" sl
JOIN "Product" p ON p.id = sl."productId"
WHERE ar."saleId" = sl."saleId"
  AND (ar."currencyId" IS NULL OR ar."currencyId" = '')
  AND NOT EXISTS (
    SELECT 1 FROM "SalePayment" sp
    WHERE sp."saleId" = ar."saleId"
  );