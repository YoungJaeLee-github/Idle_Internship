const jwt = require("jsonwebtoken")
const secretKey = require("../config/jwt_config.js").secretKey
const accessTokenOptions = require("../config/jwt_config.js").accessTokenOptions
const refreshTokenOptions = require("../config/jwt_config.js").refreshTokenOptions
const TOKEN_EXPIRED = -3
const TOKEN_INVALID = -2

module.exports = {
    sign: async (user) => {
        const accessTokenPayload = {
            email: user.email,
            expiresIN: "30m"
        }

        const refreshTokenPayload = {
            email: user.email,
            expiresIN: "14d"
        }

        const accessToken = jwt.sign(accessTokenPayload, secretKey, accessTokenOptions)
        const refreshToken = jwt.sign(refreshTokenPayload, secretKey, refreshTokenOptions)

        return {
            access_token: accessToken,
            refresh_token: refreshToken
        }
    },
    verify: async (token) => {
        let decoded
        try {
            decoded = jwt.verify(token, secretKey)
        } catch (err) {
            if (err.message === 'jwt expired') {
                console.log('expired token')
                return TOKEN_EXPIRED
            } else if (err.message === 'invalid token') {
                console.log('invalid token')
                console.log(TOKEN_INVALID)
                return TOKEN_INVALID
            } else {
                console.log('invalid token')
                return TOKEN_INVALID
            }
        }
        return decoded
    }
}
