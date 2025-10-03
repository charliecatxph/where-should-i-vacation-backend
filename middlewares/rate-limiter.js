import NodeCache from "node-cache";
export const ipCache = new NodeCache({ stdTTL: 86400, checkperiod: 600 });

export const ctxLimiter = (req, res, next) => {
    const refreshToken = req.cookies.refreshToken;
    if (refreshToken) return next();

    const ip_addr = req.ip;
    const cachedIp = ipCache.get(ip_addr.toString());

    if (cachedIp === undefined) {
        ipCache.set(ip_addr.toString(), {
            gen: 1,
            it: 1,
        })
    } 
    req.ntl_user = ipCache.get(ip_addr.toString());
    req.ntl = true;
    next();
}