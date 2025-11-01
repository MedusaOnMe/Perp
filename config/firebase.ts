import dotenv from 'dotenv';
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

// Load environment variables first
dotenv.config();

let db: FirebaseFirestore.Firestore;
let initialized = false;

export function initializeFirebase() {
  if (initialized) {
    return; // Already initialized
  }

  try {
    // Initialize Firebase Admin SDK
    const serviceAccount = process.env.GOOGLE_APPLICATION_CREDENTIALS;

    if (!serviceAccount) {
      throw new Error('GOOGLE_APPLICATION_CREDENTIALS environment variable not set');
    }

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: process.env.FIRESTORE_PROJECT_ID
    });

    db = getFirestore();

    // Set Firestore settings
    db.settings({
      ignoreUndefinedProperties: true
    });

    initialized = true;

    console.log('✅ Firebase initialized successfully');
    console.log(`📦 Project ID: ${process.env.FIRESTORE_PROJECT_ID}`);

  } catch (error) {
    console.error('❌ Firebase initialization failed:', error);
    throw error;
  }
}

export function getDb(): FirebaseFirestore.Firestore {
  if (!initialized) {
    initializeFirebase();
  }
  return db;
}

// Collection references
export const Collections = {
  USERS: 'users',
  PENDING_EXPORTS: 'pending_exports',
  KEY_EXPORTS: 'key_exports',
  PROCESSED_TWEETS: 'processed_tweets',
  ORDERS: 'orders',
  POSITIONS: 'positions',
  DEPOSITS: 'deposits',
  PLATFORM_WALLETS: 'platform_wallets'
} as const;

export default { initializeFirebase, getDb, Collections };
