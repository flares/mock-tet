// Firebase + Gemini config — copy to js/firebase-config.js (gitignored). NEVER commit that file.
//
// geminiApiKey: free key from https://aistudio.google.com/apikey (no billing needed)
// Everything else: Firebase console → Project settings → Your apps → SDK setup
//
window.FIREBASE_CONFIG = {
  apiKey:            "YOUR_FIREBASE_API_KEY",
  authDomain:        "your-project-id.firebaseapp.com",
  projectId:         "your-project-id",
  storageBucket:     "your-project-id.firebasestorage.app",
  messagingSenderId: "000000000000",
  appId:             "1:000000000000:web:0000000000000000000000",
  measurementId:     "G-XXXXXXXXXX",
  geminiApiKey:      "YOUR_GEMINI_API_KEY",
};
