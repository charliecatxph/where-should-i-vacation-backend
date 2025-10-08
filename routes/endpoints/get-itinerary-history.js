import db from "../../dependencies/firestore.js";

const getItineraryHistory = async (req, res) => {
  try {
    console.log(`[${new Date().toISOString()}] | [Get Itinerary History] Checking itinerary history for ${req.user.id}`);
    const snapshot = await db
      .collection("itinerary-generation-history")
      .where("userId", "==", req.user.id)
      .orderBy("created_at", "desc")
      .get();

    if (snapshot.size === 0) {
      console.log(`[${new Date().toISOString()}] | [Get Itinerary History] No itinerary history found for ${req.user.id}`);
      return res.json({
        generations: [],
      });
    }

    const generations = snapshot.docs.map((generationDoc) => {
      const { userId, ...filtered } = generationDoc.data();
      return {
        ...filtered,
        id: generationDoc.id,
      };
    });

    console.log(`[${new Date().toISOString()}] | [Get Itinerary History] Returning itinerary history to user...`);

    res.json({
      generations,
    });
  } catch (e) {
    console.log(
      `[${new Date().toISOString()}] [Get Itinerary History] Exception at ${req.originalUrl}. Error data: ${e.message}`
    );
    return res.status(500).json({
      code: "SERVER_ERROR",
      err: e.message,
    });
  }
};

export { getItineraryHistory };
