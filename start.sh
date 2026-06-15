#!/bin/bash
# JO-Administrativo - Start Script
# Forces correct DATABASE_URL overriding any stale system env var (old SQLite path)

export DATABASE_URL="postgresql://neondb_owner:npg_7jqFN8BQUwKS@ep-purple-night-aj20yenk-pooler.c-3.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require"

echo "=========================================="
echo "  JO-Administrativo ERP/POS"
echo "  DB: PostgreSQL (Neon)"
echo "  URL: http://localhost:3000"
echo "=========================================="
echo ""
echo "Credenciales:"
echo "  Admin: admin@admin.com / admin123"
echo ""

npx next dev -p 3000
