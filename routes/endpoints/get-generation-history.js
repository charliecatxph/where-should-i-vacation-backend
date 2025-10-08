import db from "../../dependencies/firestore.js";
import logger from "../../dependencies/logger.js";

const getGenerationHistory = async (req, res) => {
  try {
    logger(`Checking generation history for ${req.user.id}`, req.path);
    const snapshot = await db
      .collection("generation-history")
      .where("userId", "==", req.user.id)
      .orderBy("created_at", "desc")
      .get();

    if (snapshot.size === 0) {
      logger(`No generation history for ${req.user.id}`, req.path);
    
      return res.json({
        generations: [],
      });
    }

    const generations = snapshot.docs.map((generationDoc) => {
      const { userId, interpretation, cachedPlaces, generation, ...filtered } =
        generationDoc.data();
      return {
        ...filtered,
        id: generationDoc.id,
        placesCount: generation.length,
      };
    });

    logger("Returning generation history to user...", req.path);
    res.json({
      generations,
    });
  } catch (e) {
    logger(`Exception at ${req.originalUrl}. Error data: ${e.message}`, req.path)
    return res.status(500).json({
      code: "SERVER_ERROR",
      err: e.message,
    });
  }
};

export { getGenerationHistory };
