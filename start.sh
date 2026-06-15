#!/bin/bash
# JO-Administrativo - Start Script
# Forces correct DATABASE_URL overriding any stale system env var (old SQLite path)

export DATABASE_URL="postgresql://neondb_owner:npg_ICHtoF39sBOg@ep-flat-salad-apfgfrde-pooler.c-7.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require"

echo "=========================================="
echo "  JO-Administrativo ERP/POS"
echo "  DB: PostgreSQL (Neon)"
echo "  URL: http://localhost:3000"
echo "=========================================="
echo ""
echo "Credenciales de prueba:"
echo "  Admin:    carlos@sistema.com / admin123"
echo "  Cajera:   maria@sistema.com / cajera123"
echo "  Vendedor: jose@sistema.com / vendedor123"
echo ""

npx next dev -p 3000
