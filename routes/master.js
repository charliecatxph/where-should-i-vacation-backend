const express = require("express");
const {
  getTravelRecommendations,
} = require("./endpoints/get-travel-recommendations");
const { login } = require("./endpoints/login");
const { register } = require("./endpoints/register");
const { googleSSO } = require("./endpoints/google-sso");
const { userRehydration } = require("./endpoints/user-rehydration");
const { logout } = require("./endpoints/logout");
const { secureCTXgate } = require("../middlewares/secureCTXgate");
const { getLocations } = require("./endpoints/autocomplete");
const { getGenerationHistory } = require("./endpoints/get-generation-history");
const { generateItinerary } = require("./endpoints/generate-itinerary");
const { viewPlace } = require("./endpoints/view-place");
const { getPlaceHotels } = require("./endpoints/get-place-hotels");
const {
  createCheckoutSession,
} = require("./endpoints/create-checkout-session");
const { verifyStripe } = require("./endpoints/verify-stripe");
const { getItineraryHistory } = require("./endpoints/get-itinerary-history");
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
module.exports = router;
