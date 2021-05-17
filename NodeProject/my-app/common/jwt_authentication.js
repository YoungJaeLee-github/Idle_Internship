const jwt = require("./jwt.js")
const TOKEN_EXPIRED = -3
const TOKEN_INVALID = -2
const moment = require("moment")
require("moment-timezone")
moment.tz.setDefault("Asia/Seoul")

const authenticationUtil = {
    checkToken: async (req, res, next) => {
        let accessToken = req.headers.access_token
        let refreshToken = req.headers.refresh_token

        if (!accessToken && !refreshToken)
            return res.status(401).json({
                content: "empty token"
            })

        const decodedAccessToken = await jwt.verify(accessToken)
        if (decodedAccessToken === TOKEN_EXPIRED) {

        }
        if (decodedAccessToken === TOKEN_INVALID)
            return res.status(401).json({
                content: "invalid token"
            })
        if (decodedAccessToken.email === undefined)
            return res.status(401).json({
                content: "invalid token"
            })
        next()
    }
}