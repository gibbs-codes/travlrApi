# TravlrAPI - Deployment Guide

## Quick Start

### Prerequisites
- Node.js 18.x LTS
- MongoDB 7.0+
- Git
- Docker (optional)

### Development Setup
```bash
# Clone repository
git clone https://github.com/gibbs-codes/travlrApi.git
cd travlrApi

# Install dependencies
npm install

# Copy environment configuration
cp .env.example .env
# Edit .env with your API keys and configuration

# Start development server
npm run dev
```

### Production Deployment

#### Option 1: Docker (Recommended)
```bash
# Development with Docker
npm run docker:dev

# Production with Docker
npm run docker:prod
```

#### Option 2: PM2 Process Manager
```bash
# Install PM2 globally
npm install -g pm2

# Install production dependencies
npm ci --only=production

# Start with PM2
pm2 start ecosystem.config.js --env production

# Setup auto-restart on reboot
pm2 startup
pm2 save
```

#### Option 3: Direct Node.js
```bash
# Production start
NODE_ENV=production npm start
```

## API Documentation

### Endpoint Overview
- **Health Check**: `GET /health`
- **Create Trip**: `POST /api/trip/create`
- **Get Trip**: `GET /api/trip/:tripId`
- **Trip Status**: `GET /api/trip/:tripId/status`
- **Select Recommendations**: `PUT /api/trip/:tripId/select`
- **Rerun Agents**: `POST /api/trip/:tripId/rerun`

### Complete Documentation
- **OpenAPI Spec**: `/docs/openapi.yaml`
- **Frontend Integration**: `/docs/frontend-integration.md`
- **API Examples**: `/docs/api-examples/`

## Testing & Validation

### Run Tests
```bash
# Basic API tests
npm test

# Comprehensive deployment validation
npm run validate

# Manual API testing
node test-api-mvp.js
```

### Deployment Validation
The deployment validation script checks:
- ✅ Environment configuration
- ✅ Database connectivity  
- ✅ API endpoint functionality
- ✅ Performance benchmarks
- ✅ Security headers
- ✅ Concurrent request handling

## Environment Configuration

### Required Variables
```bash
NODE_ENV=production
PORT=3000
MONGODB_URI=mongodb://localhost:27017/travlrapi

# AI Provider (choose one)
OPENAI_API_KEY=sk-...           # OpenAI GPT models
# OR
OLLAMA_HOST=http://localhost:11434  # Local Ollama
```

### External Service APIs (Optional)
```bash
# Flight data
AMADEUS_CLIENT_ID=...
AMADEUS_CLIENT_SECRET=...

# Location services
GOOGLE_MAPS_API_KEY=...

# Hotel data
RAPIDAPI_KEY=...
```

### Production Security
```bash
JWT_SECRET=your-complex-secret-256-bits
CORS_ORIGIN=https://yourdomain.com
LOG_LEVEL=warn
```

## Architecture Overview

### AI Agent System
TravlrAPI uses specialized AI agents to generate travel recommendations:

1. **Flight Agent** - Searches for flight options using Amadeus API
2. **Accommodation Agent** - Finds hotels via RapidAPI/Booking.com
3. **Activity Agent** - Discovers attractions and experiences
4. **Restaurant Agent** - Recommends dining options
5. **Transportation Agent** - Local transport suggestions

### Execution Flow
```
Trip Creation → Agent Orchestrator → [Parallel Execution] → Recommendations Ready
     ↓              ↓                  ↓         ↓         ↓
  Database      Phase 1: Flight    Activity  Restaurant  Transport
   Entry        + Accommodation    (depends  (depends   (depends
                                  on prev)  on prev)   on prev)
```

### Performance Characteristics
- **Trip Creation**: < 5 seconds (initial API response)
- **Agent Execution**: 15-30 seconds (background processing)
- **Status Polling**: Recommended 2-3 second intervals
- **Concurrent Users**: Supports 100+ simultaneous trips

## Production Features

### ✅ Implemented
- [x] Comprehensive API documentation with OpenAPI 3.0
- [x] Docker containerization for development and production  
- [x] Environment variable validation and configuration
- [x] Automated test suite with deployment validation
- [x] Security headers and CORS configuration
- [x] Database connection pooling and optimization
- [x] Health check endpoints with dependency monitoring
- [x] Frontend integration guides and code examples

### 🚧 Production Ready (Configured)
- [x] Rate limiting middleware (express-rate-limit)
- [x] Request/response logging (winston + morgan)
- [x] Input validation and sanitization (express-validator)
- [x] Process management (PM2 configuration)
- [x] Performance monitoring hooks (prom-client)

### 📋 Manual Setup Required
- [ ] SSL/TLS certificate configuration
- [ ] Load balancer setup (Nginx/HAProxy)
- [ ] Database replica set configuration
- [ ] External monitoring integration (Sentry, New Relic)
- [ ] Backup and disaster recovery procedures

## Monitoring & Observability

### Health Checks
```bash
# Basic health
curl http://localhost:3000/health

# Response includes:
# - Database connectivity status
# - External service availability
# - Memory and CPU usage
# - Application uptime
```

### Logs
- **Application logs**: `logs/combined.log`
- **Error logs**: `logs/error.log`  
- **PM2 logs**: `logs/pm2-*.log`

### Metrics (Available)
- HTTP request duration and count
- Trip creation success/failure rates
- Agent execution performance
- Database query performance
- Memory and CPU utilization

## Common Issues & Solutions

### Database Connection Errors
```bash
# Check MongoDB is running
mongo --eval "db.adminCommand('ismaster')"

# Verify connection string format
echo $MONGODB_URI
```

### Agent Execution Timeouts
- **Cause**: External API rate limits or network issues
- **Solution**: Check API key validity and network connectivity
- **Monitoring**: Review agent-specific error logs

### High Memory Usage
- **Cause**: Memory leaks in agent execution or database connections
- **Solution**: Monitor with PM2, restart if memory exceeds 1GB
- **Prevention**: Regular PM2 restarts via cron

### CORS Issues
- **Cause**: Frontend domain not in CORS_ORIGIN
- **Solution**: Add your domain to CORS_ORIGIN environment variable
- **Example**: `CORS_ORIGIN=https://myapp.com,http://localhost:3000`

## Security Considerations

### API Security
- ✅ Helmet.js security headers enabled
- ✅ CORS configured for specific origins
- ✅ Input validation on all endpoints
- ✅ Rate limiting on trip creation and status polling
- ⚠️ Authentication not yet implemented (planned for v2)

### Data Security
- ✅ MongoDB connection with authentication
- ✅ Environment variables for sensitive data
- ✅ No sensitive data in logs (production mode)
- ⚠️ Encryption at rest depends on MongoDB configuration

### Network Security
- 📋 SSL/TLS termination at load balancer
- 📋 VPC/firewall configuration
- 📋 Regular security updates

## Scaling Considerations

### Horizontal Scaling
- PM2 cluster mode distributes load across CPU cores
- Multiple server instances can run behind load balancer
- Database read replicas for improved read performance
- Redis caching layer for session and recommendation data

### Performance Optimization
- Database indexes on frequently queried fields
- Connection pooling for database and external APIs
- Caching of recommendation data
- CDN for static assets

### Resource Requirements

**Minimum (Single Instance):**
- 2 CPU cores
- 4GB RAM  
- 20GB storage

**Recommended (Production):**
- 4 CPU cores
- 8GB RAM
- 50GB SSD storage
- Load balancer
- Database cluster

## Support & Maintenance

### Regular Tasks
- **Daily**: Monitor error logs and performance metrics
- **Weekly**: Review agent execution success rates
- **Monthly**: Database optimization and cleanup
- **Quarterly**: Security audit and dependency updates

### Emergency Procedures
1. **Service Down**: Check PM2 status, restart if needed
2. **Database Issues**: Verify connectivity, restart MongoDB
3. **High Error Rates**: Check external API status and rate limits
4. **Memory Leaks**: Restart PM2 processes, investigate logs

### Updates & Deployments
```bash
# Graceful deployment
git pull origin main
npm ci --only=production
pm2 reload ecosystem.config.js --env production

# Zero-downtime with PM2
pm2 reload all
```

## API Integration Examples

### JavaScript/Node.js
```javascript
const response = await fetch('http://localhost:3000/api/trip/create', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    destination: 'Paris',
    origin: 'New York',
    departureDate: '2025-12-15',
    returnDate: '2025-12-20',
    travelers: 2,
    preferences: {
      interests: ['cultural', 'food'],
      budget: { total: 3000, currency: 'USD' }
    },
    collaboration: { createdBy: 'user123' }
  })
});

const result = await response.json();
console.log('Trip ID:', result.data.tripId);
```

### React Hook
```javascript
import { useTrip } from './hooks/useTrip';

function TripPlanner() {
  const { createTrip, trip, status, loading } = useTrip();
  
  const handleSubmit = async (formData) => {
    const newTrip = await createTrip(formData);
    // Automatically polls for status updates
  };
  
  return (
    <div>
      {loading && <div>Creating your trip...</div>}
      {status && <TripProgress status={status} />}
      {trip && <TripResults trip={trip} />}
    </div>
  );
}
```

## Contributing

### Development Workflow
1. Fork the repository
2. Create feature branch: `git checkout -b feature/my-feature`
3. Make changes and add tests
4. Run validation: `npm run validate`
5. Commit changes: `git commit -m "Add feature"`
6. Push to branch: `git push origin feature/my-feature`
7. Create Pull Request

### Code Standards
- Use ESLint configuration
- Add tests for new endpoints
- Update API documentation
- Follow existing code patterns

---

## Additional Resources

- **Full API Documentation**: [docs/openapi.yaml](docs/openapi.yaml)
- **Frontend Integration**: [docs/frontend-integration.md](docs/frontend-integration.md)
- **Production Checklist**: [docs/PRODUCTION-READINESS.md](docs/PRODUCTION-READINESS.md)
- **API Examples**: [docs/api-examples/](docs/api-examples/)

For questions or support, please open an issue or contact the development team.

**Version**: 1.0.0  
**Last Updated**: 2025-01-21  
**License**: MIT