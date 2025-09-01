# TravlrApi - AI-Powered Travel Planning API

A Node.js/Express backend with AI agents for trip planning, designed to work with a React frontend.

## 🚀 Quick Start

### Backend Setup

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Environment Setup**
   The `.env` file is already configured for development with:
   - Mock AI provider (no API keys needed)
   - MongoDB connection to localhost
   - CORS enabled for React frontend

3. **Start the Server**
   ```bash
   npm start
   # Server will run on http://localhost:3000
   ```

4. **Test the API**
   ```bash
   node test-api.js
   ```

### Frontend Setup (React)

1. **Navigate to Frontend**
   ```bash
   cd ../travlrUI
   npm install
   npm run dev
   # Frontend will run on http://localhost:5173 (or similar)
   ```

## 🎯 Key Features Implemented

### ✅ Backend API
- **Trip Planning Endpoint**: `POST /api/trip/plan`
- **Agent Status**: `GET /api/trip/agents/status`  
- **Health Check**: `GET /health`
- **AI Agent Orchestration**: 5 specialized agents working together
- **Mock Data**: Enhanced mock data for all agent types
- **MongoDB Integration**: Ready for data persistence

### ✅ AI Agents
- **FlightAgent**: Enhanced with 6+ flight options, dynamic pricing
- **AccommodationAgent**: 8+ accommodation types (hotels, Airbnb, hostels)
- **ActivityAgent**: Cultural, food, adventure activities
- **RestaurantAgent**: Diverse cuisine options with ratings
- **TransportationAgent**: Multiple transport modes
- **TripOrchestrator**: Coordinates all agents

### ✅ Frontend Integration  
- **API Service Layer**: Complete TypeScript service for backend calls
- **ChatSidebar**: Natural language trip planning ("Plan a 5-day trip to Paris")
- **Trip Planner Form**: Detailed form with real API integration
- **Error Handling**: Proper error states and loading indicators

## 🧪 Testing the Demo

### Option 1: Chat Interface
1. Start both backend and frontend servers
2. Open the React app in your browser
3. Use the chat sidebar and try:
   - "Plan a 5-day trip to Paris"
   - "I want to visit Tokyo for a week"
   - "Plan a 3-day trip to Rome"

### Option 2: Form Interface
1. Use the detailed trip planning form
2. Fill in destination, dates, preferences
3. Click "Submit Trip Plan"
4. View the AI-generated recommendations

### Option 3: Direct API Testing
```bash
# Test health endpoint
curl http://localhost:3000/health

# Test trip planning
curl -X POST http://localhost:3000/api/trip/plan \
  -H "Content-Type: application/json" \
  -d '{
    "destination": "Paris",
    "origin": "New York", 
    "departureDate": "2024-03-15",
    "returnDate": "2024-03-20",
    "travelers": 2,
    "interests": ["cultural", "food"]
  }'
```

## 🏗️ Architecture

### Agent Flow
1. **TripOrchestrator** receives planning request
2. **Parallel Agent Execution**: All 5 agents run simultaneously
3. **Mock Data Generation**: Each agent returns realistic recommendations
4. **Result Synthesis**: Orchestrator combines all agent results
5. **AI Enhancement**: Mock AI provider adds final recommendations

### Mock AI Provider
- Simulates OpenAI/Claude responses with realistic data
- No API keys required for development
- Configurable response delays
- Structured JSON responses

## 📊 What's Working

✅ **Backend**: Full API with all endpoints functional  
✅ **Database**: MongoDB connection established  
✅ **AI Agents**: All 5 agents with enhanced mock data  
✅ **Frontend**: React components with real API calls  
✅ **Error Handling**: Proper error states and user feedback  
✅ **Testing**: Automated test script validates all endpoints  

## 🔧 Configuration

### Environment Variables (.env)
```env
PORT=3000
AI_PROVIDER=mock          # Uses mock AI responses
MONGODB_URI=mongodb://localhost:27017/travlrapi
CORS_ORIGIN=http://localhost:3001
MOCK_DELAY_MS=500         # Simulated API response delay
```

### Switching to Real AI Providers
To use real AI providers, update `.env`:
```env
AI_PROVIDER=openai
OPENAI_API_KEY=your_key_here
```

## 🎉 Demo Highlights

The system demonstrates:
- **AI Agent Orchestration**: Multiple agents working together
- **Natural Language Processing**: Chat interface understands trip requests
- **Realistic Mock Data**: Varies by destination (Paris vs Tokyo vs Rome)
- **Full-Stack Integration**: React frontend ↔ Express backend
- **Error Resilience**: Handles connection issues gracefully
- **Scalable Architecture**: Easy to add new agents or AI providers

Perfect for demonstrating AI-powered travel planning without requiring real API integrations!