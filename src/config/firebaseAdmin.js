const admin = require("firebase-admin");

function parseServiceAccountFromEnv(rawValue) {
  try {
    const parsed = JSON.parse(rawValue);
    // Fix newlines even inside the JSON string fallback
    if (parsed.private_key) {
      parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
    }
    return parsed;
  } catch (_error) {
    const normalized = rawValue.replace(/\\"/g, '"');
    const parsed = JSON.parse(normalized);
    if (parsed.private_key) {
      parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
    }
    return parsed;
  }
}

function getServiceAccountFromSplitEnv() {
  const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = process.env;

  if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) {
    return null;
  }

  return {
    projectId: FIREBASE_PROJECT_ID,
    clientEmail: FIREBASE_CLIENT_EMAIL,
    privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  };
}

function initFirebaseAdmin() {
  if (admin.apps && admin.apps.length) return admin;

  const splitEnvServiceAccount = getServiceAccountFromSplitEnv();

  if (splitEnvServiceAccount) {
    admin.initializeApp({
      credential: admin.credential.cert(splitEnvServiceAccount),
    });
    console.log("Firebase initialized via split env variables.");
  } else if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    const serviceAccount = parseServiceAccountFromEnv(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log("Firebase initialized via JSON string.");
  } else {
    admin.initializeApp();
    console.log("Firebase initialized via default credentials.");
  }

  return admin;
}

const firebaseAdmin = initFirebaseAdmin();

module.exports = firebaseAdmin;
module.exports.initFirebaseAdmin = initFirebaseAdmin;