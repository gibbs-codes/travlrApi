#!/usr/bin/env node

import process from 'node:process';
import databaseService from '../../src/services/database.js';
import { Trip } from '../../src/models/index.js';

const DEFAULT_SHARING = Object.freeze({
  isEnabled: false,
  shareableLink: null,
  linkExpiration: null,
  createdAt: null,
  accessCount: 0,
  lastAccessedAt: null
});

const toPlainObject = (value) => {
  if (!value) return {};
  if (typeof value.toObject === 'function') {
    return value.toObject();
  }
  return value;
};

const toDateOrNull = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const toBoolean = (value, fallback = false) => {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes'].includes(normalized)) return true;
    if (['false', '0', 'no'].includes(normalized)) return false;
  }
  return Boolean(value);
};

const toNumberOrDefault = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

const sharingEquals = (current, next) => {
  return (
    current.isEnabled === next.isEnabled &&
    current.shareableLink === next.shareableLink &&
    dateEquals(current.linkExpiration, next.linkExpiration) &&
    dateEquals(current.createdAt, next.createdAt) &&
    current.accessCount === next.accessCount &&
    dateEquals(current.lastAccessedAt, next.lastAccessedAt)
  );
};

const dateEquals = (a, b) => {
  if (!a && !b) return true;
  if (!a || !b) return false;
  const dateA = a instanceof Date ? a : new Date(a);
  const dateB = b instanceof Date ? b : new Date(b);
  return dateA.getTime() === dateB.getTime();
};

const buildSharing = (primary = {}, secondary = {}) => {
  const merged = {
    ...DEFAULT_SHARING,
    ...toPlainObject(secondary),
    ...toPlainObject(primary)
  };

  return {
    isEnabled: toBoolean(merged.isEnabled, false),
    shareableLink: merged.shareableLink ?? null,
    linkExpiration: toDateOrNull(merged.linkExpiration),
    createdAt: toDateOrNull(merged.createdAt),
    accessCount: toNumberOrDefault(merged.accessCount, 0),
    lastAccessedAt: toDateOrNull(merged.lastAccessedAt)
  };
};

async function run() {
  let processed = 0;
  let updated = 0;
  let migratedFromCollaboration = 0;

  try {
    await databaseService.connect();

    const cursor = Trip.find().cursor();

    for await (const trip of cursor) {
      processed += 1;

      const currentSharing = buildSharing(trip.sharing, {});
      const collaborationSharing = buildSharing(trip.collaboration?.sharing, {});
      const desiredSharing = buildSharing(trip.sharing, trip.collaboration?.sharing);

      const needsSharingUpdate = !sharingEquals(currentSharing, desiredSharing);
      const hasCollaborationSharing = !!trip.collaboration?.sharing;

      if (!needsSharingUpdate && !hasCollaborationSharing) {
        continue;
      }

      if (needsSharingUpdate) {
        trip.set('sharing', desiredSharing);
        trip.markModified('sharing');
        updated += 1;
      }

      if (hasCollaborationSharing) {
        trip.set('collaboration.sharing', undefined);
        trip.markModified('collaboration');
        migratedFromCollaboration += 1;
      }

      if (needsSharingUpdate || hasCollaborationSharing) {
        await trip.save();
      }
    }

    console.log('✅ Trip sharing backfill complete', {
      processed,
      updated,
      migratedFromCollaboration
    });
  } catch (error) {
    console.error('❌ Trip sharing backfill failed:', error);
    process.exitCode = 1;
  } finally {
    await databaseService.disconnect().catch(() => {
      console.warn('⚠️ Failed to disconnect from database cleanly');
    });
  }
}

run().then(() => {
  if (process.exitCode && process.exitCode !== 0) {
    process.exit(process.exitCode);
  }
}).catch((error) => {
  console.error('❌ Unexpected migration error:', error);
  process.exit(1);
});
