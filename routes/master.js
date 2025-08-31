import express from "express";
import {
  getTravelRecommendations,
} from "./endpoints/get-travel-recommendations.js";
import { login } from "./endpoints/login.js";
import { register } from "./endpoints/register.js";
import { googleSSO } from "./endpoints/google-sso.js";
import { userRehydration } from "./endpoints/user-rehydration.js";
import { logout } from "./endpoints/logout.js";
import { secureCTXgate } from "../middlewares/secureCTXgate.js";
import { getLocations } from "./endpoints/autocomplete.js";
import { getGenerationHistory } from "./endpoints/get-generation-history.js";
import { generateItinerary } from "./endpoints/generate-itinerary.js";
import { viewPlace } from "./endpoints/view-place.js";
import { getPlaceHotels } from "./endpoints/get-place-hotels.js";
import {
  createCheckoutSession,
} from "./endpoints/create-checkout-session.js";
import { verifyStripe } from "./endpoints/verify-stripe.js";
import { getItineraryHistory } from "./endpoints/get-itinerary-history.js";
import forgotPassword from "./endpoints/forgot-password.js";
import changePassword from "./endpoints/change-password.js";
import verifyAccount from "./endpoints/verify-account.js";
const router = express.Router();

router.get(
  "/get-travel-recommendations",
  secureCTXgate,
  getTravelRecommendations
);
router.get("/get-itinerary-history", secureCTXgate, getItineraryHistory);
router.post("/verify-stripe", secureCTXgate, verifyStripe);
router.post("/purchase-credits", secureCTXgate, createCheckoutSession);
router.get("/get-place-hotels", secureCTXgate, getPlaceHotels);
router.get("/view-place", secureCTXgate, viewPlace);
router.get("/generate-itinerary", secureCTXgate, generateItinerary);
router.get("/get-generation-history", secureCTXgate, getGenerationHistory);
router.get("/get-locations", getLocations);
router.post("/login", login);
router.post("/register", register);
router.post("/google-sso", googleSSO);
router.post("/user-rehydration", userRehydration);
router.post("/logout", logout);
router.post("/forgot-password", forgotPassword);
router.post("/change-password", changePassword);
router.post("/verify-account", verifyAccount);
export default router;
