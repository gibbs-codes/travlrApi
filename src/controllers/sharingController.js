import { Trip } from '../models/index.js';
import { formatSuccess } from '../middleware/validation.js';
import crypto from 'crypto';

/**
 * Generate or retrieve shareable link for a trip
 * POST /api/trip/:tripId/share
 */
export const generateShareLink = async (req, res) => {
  try {
    const { tripId } = req.params;
    const { expirationDays = 30, regenerate = false } = req.body;

    const trip = await Trip.findOne({ tripId });
    if (!trip) {
      return res.status(404).json({
        success: false,
        error: 'Trip not found',
        message: `Trip with ID ${tripId} does not exist`
      });
    }

    // Check if user owns the trip (basic authorization)
    const { userId } = req.body; // Simple user identification for MVP
    if (trip.collaboration.createdBy !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
        message: 'Only the trip creator can generate share links'
      });
    }

    // Check if we need to generate a new link
    const needsNewLink = regenerate || 
                         !trip.sharing?.shareableLink || 
                         !trip.sharing || 
                         !(trip.sharing && trip.isShareLinkActive);

    if (needsNewLink) {
      // Generate secure random token
      const shareToken = crypto.randomBytes(32).toString('hex');
      const expirationDate = new Date();
      expirationDate.setDate(expirationDate.getDate() + expirationDays);

      // Update trip with sharing info
      if (!trip.sharing) {
        trip.sharing = {};
      }
      trip.sharing.isEnabled = true;
      trip.sharing.shareableLink = shareToken;
      trip.sharing.linkExpiration = expirationDate;
      trip.sharing.createdAt = new Date();
      trip.sharing.accessCount = 0;
      
      // Mark the sharing field as modified for Mongoose
      trip.markModified('sharing');

      await trip.save();
    }

    res.json(formatSuccess(
      {
        tripId: trip.tripId,
        shareableLink: trip.sharing?.shareableLink,
        linkExpiration: trip.sharing?.linkExpiration,
        isActive: trip.sharing ? trip.isShareLinkActive : false,
        accessCount: trip.sharing?.accessCount || 0,
        shareUrl: trip.sharing?.shareableLink ? `${req.protocol}://${req.get('host')}/api/share/${trip.sharing.shareableLink}` : null
      },
      'Share link generated successfully'
    ));

  } catch (error) {
    console.error('Generate share link error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to generate share link'
    });
  }
};

/**
 * Access trip via shareable link (read-only)
 * GET /api/share/:shareToken
 */
export const getSharedTrip = async (req, res) => {
  try {
    const { shareToken } = req.params;

    const trip = await Trip.findOne({ 
      'sharing.shareableLink': shareToken,
      'sharing.isEnabled': true
    })
    .populate('recommendations.flight')
    .populate('recommendations.accommodation')
    .populate('recommendations.activity')
    .populate('recommendations.restaurant')
    .populate('recommendations.transportation')
    .populate('selectedRecommendations.flight.recommendation')
    .populate('selectedRecommendations.accommodation.recommendation')
    .populate('selectedRecommendations.activity.recommendation')
    .populate('selectedRecommendations.restaurant.recommendation')
    .populate('selectedRecommendations.transportation.recommendation');

    if (!trip) {
      return res.status(404).json({
        success: false,
        error: 'Share link not found',
        message: 'This share link is invalid or has been disabled'
      });
    }

    // Check if link is expired
    if (!trip.isShareLinkActive) {
      return res.status(410).json({
        success: false,
        error: 'Share link expired',
        message: 'This share link has expired'
      });
    }

    // Update access tracking
    trip.sharing.accessCount = (trip.sharing.accessCount || 0) + 1;
    trip.sharing.lastAccessedAt = new Date();
    await trip.save();

    // Return read-only trip data (exclude sensitive info)
    const sharedTripData = {
      tripId: trip.tripId,
      title: trip.title,
      destination: trip.destination,
      origin: trip.origin,
      dates: trip.dates,
      travelers: {
        count: trip.travelers.count,
        adults: trip.travelers.adults,
        children: trip.travelers.children,
        infants: trip.travelers.infants
      },
      preferences: {
        interests: trip.preferences.interests,
        budget: trip.preferences.budget ? {
          total: trip.preferences.budget.total,
          currency: trip.preferences.budget.currency
        } : null
      },
      recommendations: trip.recommendations,
      selectedRecommendations: trip.selectedRecommendations,
      status: trip.status,
      totalRecommendations: trip.totalRecommendations,
      totalSelectedRecommendations: trip.totalSelectedRecommendations,
      durationDays: trip.durationDays,
      estimatedBudget: trip.estimatedBudget,
      createdAt: trip.createdAt,
      updatedAt: trip.updatedAt,
      isSharedView: true,
      sharedBy: trip.collaboration.createdBy
    };

    res.json(formatSuccess(
      sharedTripData,
      'Shared trip retrieved successfully'
    ));

  } catch (error) {
    console.error('Get shared trip error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to retrieve shared trip'
    });
  }
};

/**
 * Disable sharing for a trip
 * DELETE /api/trip/:tripId/share
 */
export const disableSharing = async (req, res) => {
  try {
    const { tripId } = req.params;
    const { userId } = req.body;

    const trip = await Trip.findOne({ tripId });
    if (!trip) {
      return res.status(404).json({
        success: false,
        error: 'Trip not found'
      });
    }

    // Check ownership
    if (trip.collaboration.createdBy !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
        message: 'Only the trip creator can disable sharing'
      });
    }

    if (!trip.sharing) {
      trip.sharing = {
        isEnabled: false,
        shareableLink: null,
        linkExpiration: null,
        createdAt: null,
        accessCount: 0,
        lastAccessedAt: null
      };
    }

    // Disable sharing
    trip.sharing.isEnabled = false;
    trip.markModified('sharing');
    await trip.save();

    res.json(formatSuccess(
      {
        tripId: trip.tripId,
        sharingDisabled: true
      },
      'Sharing disabled successfully'
    ));

  } catch (error) {
    console.error('Disable sharing error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to disable sharing'
    });
  }
};

/**
 * Get sharing status for a trip
 * GET /api/trip/:tripId/share
 */
export const getSharingStatus = async (req, res) => {
  try {
    const { tripId } = req.params;

    const trip = await Trip.findOne({ tripId });

    if (!trip) {
      return res.status(404).json({
        success: false,
        error: 'Trip not found'
      });
    }

    const sharingStatus = {
      tripId: trip.tripId,
      isEnabled: trip.sharing?.isEnabled || false,
      hasActiveLink: trip.sharing ? trip.isShareLinkActive : false,
      linkExpiration: trip.sharing?.linkExpiration,
      accessCount: trip.sharing?.accessCount || 0,
      lastAccessedAt: trip.sharing?.lastAccessedAt,
      createdAt: trip.sharing?.createdAt
    };

    // Only include share URL if sharing is active
    if (trip.sharing && trip.isShareLinkActive) {
      sharingStatus.shareUrl = `${req.protocol}://${req.get('host')}/api/share/${trip.sharing.shareableLink}`;
    }

    res.json(formatSuccess(
      sharingStatus,
      'Sharing status retrieved successfully'
    ));

  } catch (error) {
    console.error('Get sharing status error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to retrieve sharing status'
    });
  }
};

/**
 * Add collaborator to trip (future feature)
 * POST /api/trip/:tripId/collaborators
 */
export const addCollaborator = async (req, res) => {
  try {
    const { tripId } = req.params;
    const { email, role = 'viewer', userId } = req.body;

    const trip = await Trip.findOne({ tripId });
    if (!trip) {
      return res.status(404).json({
        success: false,
        error: 'Trip not found'
      });
    }

    // Check ownership
    if (trip.collaboration.createdBy !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
        message: 'Only the trip creator can add collaborators'
      });
    }

    // For MVP, we'll use email as a simple identifier
    const collaboratorId = email.toLowerCase();

    // Check if already a collaborator
    const existingCollaborator = trip.collaboration.collaborators.find(
      collab => collab.userId === collaboratorId
    );

    if (existingCollaborator) {
      return res.status(400).json({
        success: false,
        error: 'User is already a collaborator'
      });
    }

    // Add collaborator
    trip.collaboration.collaborators.push({
      userId: collaboratorId,
      role,
      addedAt: new Date(),
      addedBy: userId,
      permissions: {
        canEdit: role === 'editor' || role === 'owner',
        canInvite: role === 'owner',
        canDelete: false
      }
    });

    await trip.save();

    res.json(formatSuccess(
      {
        tripId: trip.tripId,
        collaboratorAdded: collaboratorId,
        role,
        totalCollaborators: trip.collaboration.collaborators.length
      },
      'Collaborator added successfully'
    ));

  } catch (error) {
    console.error('Add collaborator error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to add collaborator'
    });
  }
};
