# Running the Project Locally

## Current Status
✅ Both backend and frontend are running successfully

## Services

### Backend (FastAPI)
- **URL**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs
- **Health Check**: http://localhost:8000/health

### Frontend (Next.js)
- **URL**: http://localhost:3000
- **Landing Page**: Persian RTL layout with login button

## Prerequisites
- PostgreSQL and Redis running in Docker (ma-postgres, ma-redis)
- Python 3.12 with virtual environment
- Node.js v24.12.0

## Starting the Services

### 1. Ensure Database Containers are Running
```bash
docker ps | grep -E "ma-postgres|ma-redis"
```

If not running:
```bash
docker start ma-postgres ma-redis
```

### 2. Start Backend
```bash
cd backend
./venv/bin/uvicorn src.main:app --host 0.0.0.0 --port 8000 --reload
```

### 3. Start Frontend (in another terminal)
```bash
cd frontend
npm run dev
```

## Login Credentials
- **Email**: `admin@example.com`
- **Password**: `admin123`

## Testing

### Test Backend API
```bash
# Health check
curl http://localhost:8000/health

# Login
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"admin123"}'
```

### Test Frontend
1. Open http://localhost:3000
2. Click "ورود به کار یاضف" (Login)
3. Enter credentials above
4. Should redirect to dashboard

## Troubleshooting

### Backend won't start
- Check if port 8000 is already in use: `lsof -i :8000`
- Verify database is accessible: `docker exec ma-postgres psql -U admin -d manage_agent -c "SELECT 1;"`

### Frontend won't start
- Check if port 3000 is in use: `lsof -i :3000`
- Clear node_modules and reinstall: `rm -rf node_modules && npm install --legacy-peer-deps`

### CORS errors
- Verify backend CORS settings in `backend/.env`: `CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000`
- Restart backend after changing .env

## Environment Files

### backend/.env
```
DATABASE_URL=postgresql+asyncpg://admin:admin@localhost:5432/manage_agent
DATABASE_SYNC_URL=postgresql+psycopg2://admin:admin@localhost:5432/manage_agent
REDIS_URL=redis://:redis@localhost:6379/0
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
```

### frontend/.env
```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## Next Steps
- Test login flow
- Explore dashboard features
- Test agent creation
- Review API documentation at http://localhost:8000/docs
