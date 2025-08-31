import "dotenv/config";
import Bottleneck from "bottleneck";

const amadeusLimiter = new Bottleneck({
  reservior: parseInt(process.env.AMADEUS_BOTTLENECK_RESERVOIR), // 600
  reservoirRefreshAmount: parseInt(process.env.AMADEUS_BOTTLENECK_RESERVOIR), // 600
  reservoirRefreshInterval: 1000,

  maxConcurrent: parseInt(process.env.AMADEUS_BOTTLENECK_MAX_CONCURRENT), // 3
  minTime: parseInt(process.env.AMADEUS_BOTTLENECK_MIN_TIME), // 500
});

export default amadeusLimiter;
