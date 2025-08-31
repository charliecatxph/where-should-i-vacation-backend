import db from "../../dependencies/firestore.js";

const getGenerationHistory = async (req, res) => {
  try {
    const snapshot = await db
      .collection("generation-history")
      .where("userId", "==", req.user.id)
      .orderBy("created_at", "desc")
      .get();

    if (snapshot.size === 0) {
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

    res.json({
      generations,
    });
  } catch (e) {
    console.log(
      `[${new Date().toISOString()}] [Get Generation History] Exception at ${req.originalUrl}. Error data: ${e.message}`
    );
    return res.status(500).json({
      code: "SERVER_ERROR",
      err: e.message,
    });
  }
};

export { getGenerationHistory };
