# TravlrAPI - MVP Authentication Approach

## Overview

For the MVP release, TravlrAPI uses a **simplified authentication approach** that supports anonymous trips and basic collaboration without requiring full user registration. This approach is designed to:

1. **Enable immediate usage** - Users can create trips without signing up
2. **Support basic sharing** - Simple collaboration via shareable links
3. **Prepare for future growth** - Schema ready for full authentication system
4. **Maintain security** - Secure tokens and basic ownership validation

## Current MVP Authentication Model

### Anonymous Trip Creation
- **No Registration Required**: Users can create trips without accounts
- **Simple User Identification**: Uses email/userId in request body for basic identification
- **Trip Ownership**: Determined by `collaboration.createdBy` field
- **Session-less**: No cookies or sessions - stateless operation

### User Identification Format
```json
{
  "userId": "user@example.com",  // Email or simple identifier
  "collaboration": {
    "createdBy": "user@example.com"  // Trip owner
  }
}
```

### Permission Model
```json
{
  "collaboration": {
    "createdBy": "owner@example.com",
    "collaborators": [
      {
        "userId": "viewer@example.com",
        "role": "viewer",          // viewer, editor, owner
        "addedAt": "2025-09-20T...",
        "permissions": {
          "canEdit": false,
          "canInvite": false,
          "canDelete": false
        }
      }
    ]
  }
}
```

## Sharing & Collaboration

### Shareable Links
- **Secure Tokens**: 64-character hex tokens (crypto.randomBytes(32))
- **Configurable Expiration**: Default 30 days, customizable
- **Read-Only Access**: Shared trips are view-only for non-owners
- **Access Tracking**: Count and timestamp tracking
- **No Auth Required**: Anyone with link can view (if not expired)

### Basic Ownership Validation
```javascript
// Controller validation example
if (trip.collaboration.createdBy !== userId) {
  return res.status(403).json({
    success: false,
    error: 'Access denied',
    message: 'Only the trip creator can perform this action'
  });
}
```

### Collaborator Management
- **Email-Based Identification**: Use email as userId for collaborators
- **Role-Based Permissions**: viewer/editor/owner roles
- **Invitation System**: Add collaborators via email (future feature)

## Security Considerations

### Current Security Measures
1. **Secure Token Generation**: crypto.randomBytes for all tokens
2. **Input Validation**: All endpoints validate required fields
3. **Parameter Validation**: Trip IDs, share tokens validated
4. **Basic Rate Limiting**: Via Express middleware (if configured)
5. **CORS Protection**: Configured for API security

### Limitations & Risks
1. **No Password Protection**: Anyone can claim to be any user
2. **Email Spoofing**: No email verification (MVP limitation)
3. **No Session Management**: Stateless but no persistent login
4. **Basic Authorization**: Simple ownership checks only

### Mitigation Strategies
1. **Link Expiration**: Automatic token expiration
2. **Access Logging**: Track all sharing access
3. **Validation**: Comprehensive input validation
4. **Future Auth Ready**: Schema prepared for user accounts

## Future Authentication System

### Migration Path to Full Authentication
The current schema is designed to support seamless migration to full authentication:

```javascript
// Current MVP model
{
  collaboration: {
    createdBy: "email@example.com",  // Simple string
    collaborators: [...]
  }
}

// Future authenticated model
{
  collaboration: {
    createdBy: ObjectId("user_id"),   // Reference to User model
    collaborators: [
      {
        userId: ObjectId("user_id"),  // Reference to User model
        user: { ... },                // Populated user data
        ...
      }
    ]
  }
}
```

### Planned Authentication Features
1. **User Registration/Login**: Full JWT-based authentication
2. **Email Verification**: Confirmed email addresses
3. **Password Security**: Bcrypt hashing, password requirements
4. **Session Management**: JWT tokens with refresh
5. **OAuth Integration**: Google, Facebook, Apple sign-in
6. **Profile Management**: User profiles, preferences
7. **Advanced Permissions**: Fine-grained access control

## API Usage Examples

### Create Trip (Anonymous)
```bash
curl -X POST /api/trip/create \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Paris Vacation",
    "destination": "Paris",
    "origin": "New York",
    "departureDate": "2025-12-15",
    "collaboration": {
      "createdBy": "user@example.com"
    }
  }'
```

### Generate Share Link
```bash
curl -X POST /api/trip/trip_123/share \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user@example.com",
    "expirationDays": 30
  }'
```

### Access Shared Trip
```bash
curl /api/share/abc123def456...
# No authentication required - public read-only access
```

### Add Collaborator
```bash
curl -X POST /api/trip/trip_123/collaborators \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "owner@example.com",
    "email": "friend@example.com",
    "role": "viewer"
  }'
```

## Implementation Guidelines

### For Frontend Development
1. **Store User Identifier**: Keep email/userId in local storage
2. **Include in Requests**: Send userId in request body for ownership actions
3. **Handle Permissions**: Check user role before showing edit options
4. **Share Link Management**: Provide UI for generating/managing share links
5. **Error Handling**: Handle 403 (forbidden) and 404 (not found) responses

### For Backend Development
1. **Consistent User Validation**: Always validate userId for ownership actions
2. **Secure Token Generation**: Use crypto.randomBytes for all tokens
3. **Input Sanitization**: Validate and sanitize all user inputs
4. **Error Messages**: Provide clear, actionable error messages
5. **Logging**: Log all sharing and collaboration activities

## Migration Checklist

When implementing full authentication, ensure:

- [ ] User model creation with proper indexes
- [ ] JWT implementation for session management
- [ ] Password hashing and validation
- [ ] Email verification system
- [ ] Migration script for existing anonymous trips
- [ ] Updated API endpoints for authenticated actions
- [ ] Role-based access control refinement
- [ ] OAuth provider integration
- [ ] Security audit and penetration testing

This MVP authentication approach provides immediate functionality while maintaining a clear path to full authentication as the platform grows.