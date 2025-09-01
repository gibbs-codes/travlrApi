import { TripPlanningAgent } from './baseAgent.js';

export class FlightAgent extends TripPlanningAgent {
  constructor(aiConfig = {}) {
    super(
      'FlightAgent',
      ['flight_search', 'price_comparison', 'schedule_optimization'],
      aiConfig,
      {
        maxResults: 10,
        providers: ['amadeus', 'skyscanner', 'google_flights']
      }
    );
  }

  async search(criteria) {
    // Enhanced mock flight search with dynamic data based on destination
    const destinations = this.getDestinationData(criteria.destination);
    const basePrice = destinations.basePrice || 400;
    const flightTime = destinations.flightTime || '6h 30m';
    
    const mockFlights = [
      {
        id: 'FL001',
        airline: 'United Airlines',
        departure: { airport: criteria.origin, time: '08:00', date: criteria.departureDate },
        arrival: { airport: criteria.destination, time: this.calculateArrivalTime('08:00', flightTime), date: criteria.departureDate },
        price: basePrice + 50,
        duration: flightTime,
        stops: 0,
        class: 'Economy',
        aircraft: 'Boeing 737-900',
        baggage: { carry: 1, checked: 1 },
        wifi: true,
        meals: true
      },
      {
        id: 'FL002',
        airline: 'Delta Airlines',
        departure: { airport: criteria.origin, time: '10:15', date: criteria.departureDate },
        arrival: { airport: criteria.destination, time: this.calculateArrivalTime('10:15', this.addLayoverTime(flightTime)), date: criteria.departureDate },
        price: basePrice + 120,
        duration: this.addLayoverTime(flightTime),
        stops: 1,
        stopover: 'Atlanta (ATL)',
        class: 'Economy',
        aircraft: 'Airbus A320',
        baggage: { carry: 1, checked: 1 },
        wifi: true,
        meals: false
      },
      {
        id: 'FL003',
        airline: 'American Airlines',
        departure: { airport: criteria.origin, time: '16:20', date: criteria.departureDate },
        arrival: { airport: criteria.destination, time: this.calculateArrivalTime('16:20', flightTime), date: criteria.departureDate },
        price: basePrice - 20,
        duration: flightTime,
        stops: 0,
        class: 'Economy',
        aircraft: 'Boeing 787-8',
        baggage: { carry: 1, checked: 1 },
        wifi: true,
        meals: true
      },
      {
        id: 'FL004',
        airline: 'Southwest Airlines',
        departure: { airport: criteria.origin, time: '12:30', date: criteria.departureDate },
        arrival: { airport: criteria.destination, time: this.calculateArrivalTime('12:30', this.addLayoverTime(flightTime)), date: criteria.departureDate },
        price: basePrice - 50,
        duration: this.addLayoverTime(flightTime),
        stops: 1,
        stopover: 'Chicago (MDW)',
        class: 'Economy',
        aircraft: 'Boeing 737-800',
        baggage: { carry: 1, checked: 2 },
        wifi: true,
        meals: false
      },
      {
        id: 'FL005',
        airline: 'JetBlue Airways',
        departure: { airport: criteria.origin, time: '07:45', date: criteria.departureDate },
        arrival: { airport: criteria.destination, time: this.calculateArrivalTime('07:45', flightTime), date: criteria.departureDate },
        price: basePrice + 30,
        duration: flightTime,
        stops: 0,
        class: 'Economy',
        aircraft: 'Airbus A321',
        baggage: { carry: 1, checked: 1 },
        wifi: true,
        meals: false
      },
      {
        id: 'FL006',
        airline: 'Alaska Airlines',
        departure: { airport: criteria.origin, time: '14:00', date: criteria.departureDate },
        arrival: { airport: criteria.destination, time: this.calculateArrivalTime('14:00', flightTime), date: criteria.departureDate },
        price: basePrice + 10,
        duration: flightTime,
        stops: 0,
        class: 'Economy',
        aircraft: 'Boeing 737-900ER',
        baggage: { carry: 1, checked: 1 },
        wifi: true,
        meals: true
      }
    ];

    // Filter based on criteria
    return mockFlights.filter(flight => {
      if (criteria.maxPrice && flight.price > criteria.maxPrice) return false;
      if (criteria.preferNonStop && flight.stops > 0) return false;
      if (criteria.preferredClass && flight.class !== criteria.preferredClass) return false;
      return true;
    });
  }

  async rank(results) {
    // Rank flights based on multiple factors
    return results.map(flight => ({
      ...flight,
      score: this.calculateFlightScore(flight)
    })).sort((a, b) => b.score - a.score);
  }

  calculateFlightScore(flight) {
    let score = 100;
    
    // Price factor (lower price = higher score)
    score -= (flight.price / 10);
    
    // Non-stop preference
    if (flight.stops === 0) score += 20;
    
    // Duration factor
    const durationHours = parseFloat(flight.duration.split('h')[0]);
    score -= durationHours;
    
    // Time preference (morning and afternoon flights preferred)
    const departureHour = parseInt(flight.departure.time.split(':')[0]);
    if (departureHour >= 8 && departureHour <= 16) score += 10;
    
    return Math.max(0, score);
  }

  getDestinationData(destination) {
    const destinationMap = {
      'Paris': { basePrice: 650, flightTime: '8h 15m' },
      'London': { basePrice: 580, flightTime: '7h 45m' },
      'Tokyo': { basePrice: 950, flightTime: '14h 30m' },
      'Sydney': { basePrice: 1200, flightTime: '19h 45m' },
      'New York': { basePrice: 320, flightTime: '5h 30m' },
      'Los Angeles': { basePrice: 380, flightTime: '6h 15m' },
      'Rome': { basePrice: 620, flightTime: '9h 20m' },
      'Barcelona': { basePrice: 590, flightTime: '8h 45m' },
      'Amsterdam': { basePrice: 560, flightTime: '8h 00m' },
      'Dubai': { basePrice: 720, flightTime: '12h 30m' }
    };

    const key = Object.keys(destinationMap).find(city => 
      destination.toLowerCase().includes(city.toLowerCase())
    );
    
    return destinationMap[key] || { basePrice: 450, flightTime: '6h 30m' };
  }

  calculateArrivalTime(departureTime, duration) {
    const [depHour, depMin] = departureTime.split(':').map(Number);
    const durationMatch = duration.match(/(\d+)h\s*(\d+)?m?/);
    const hours = parseInt(durationMatch[1]);
    const minutes = parseInt(durationMatch[2] || 0);
    
    const totalMinutes = depHour * 60 + depMin + hours * 60 + minutes;
    const arrivalHour = Math.floor(totalMinutes / 60) % 24;
    const arrivalMin = totalMinutes % 60;
    
    return `${arrivalHour.toString().padStart(2, '0')}:${arrivalMin.toString().padStart(2, '0')}`;
  }

  addLayoverTime(baseDuration) {
    const durationMatch = baseDuration.match(/(\d+)h\s*(\d+)?m?/);
    const hours = parseInt(durationMatch[1]);
    const minutes = parseInt(durationMatch[2] || 0);
    
    // Add 1-2 hours for layover
    const layoverHours = 1 + Math.floor(Math.random() * 2);
    const totalHours = hours + layoverHours;
    
    return `${totalHours}h ${minutes}m`;
  }
}