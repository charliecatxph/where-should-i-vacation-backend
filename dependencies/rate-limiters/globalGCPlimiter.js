import "dotenv/config";
import Bottleneck from "bottleneck";

const gcpLimiter = new Bottleneck({
  reservior: parseInt(process.env.GCP_BOTTLENECK_RESERVOIR),
  reservoirRefreshAmount: parseInt(process.env.GCP_BOTTLENECK_RESERVOIR),
  reservoirRefreshInterval: 60 * 1000,

  maxConcurrent: parseInt(process.env.GCP_BOTTLENECK_MAX_CONCURRENT),
  minTime: parseInt(process.env.GCP_BOTTLENECK_MIN_TIME),
});

export default gcpLimiter;
