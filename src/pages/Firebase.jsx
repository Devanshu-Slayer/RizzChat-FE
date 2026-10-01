// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCJbdf1Jl0OvqMrWxMCUGrpvdBzZp_HtFA",
  authDomain: "auth-1807.firebaseapp.com",
  projectId: "auth-1807",
  storageBucket: "auth-1807.firebasestorage.app",
  messagingSenderId: "109780489509",
  appId: "1:109780489509:web:1d7a247e276de51c0276cc",
  measurementId: "G-7DMMLTHEFY"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
export default app;