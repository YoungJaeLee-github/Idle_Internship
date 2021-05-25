const jwt = require("./jwt.js")
const TOKEN_EXPIRED = -3
const TOKEN_INVALID = -2
const moment = require("moment")
const getConnection = require("../config/database_config.js").getConnection
require("moment-timezone")
moment.tz.setDefault("Asia/Seoul")

const authenticationUtil = {
    checkToken: async (req, res, next) => {
        let accessToken = req.headers.access_token
        let refreshToken = req.headers.refresh_token
        if (accessToken === "" || refreshToken === "" || req.body.member_email === "" || req.body.member_email === undefined)
            return res.status(401).json({
                content: false
            })
        // 토큰이 없는 경우
        else if (!accessToken && !refreshToken) {
            getConnection((conn) => {
                let memberCheckSql = "select member_secede, member_ban from member where member_email = ?;"
                let memberCheckParam = [req.body.member_email]
                conn.query(memberCheckSql, memberCheckParam, function (error, rows) {
                    if (error) {
                        console.error(error)
                        return res.status(500).json({
                            content: "DB Error"
                        })
                    } else {
                        if (rows.length === 0) {
                            return res.status(401).json({
                                content: false
                            })
                        } else if (rows[0].member_secede === 1 || rows[0].member_ban === 1) {
                            return res.status(401).json({
                                content: false
                            })
                        } else {
                            req.isEmptyToken = 1
                            next()
                        }
                    }
                    conn.release()
                })
            })
        } else {
            getConnection((conn) => {
                let memberCheckSql = "select member_secede, member_ban from member where member_email = ?;"
                let memberCheckParam = [req.body.member_email]
                conn.query(memberCheckSql, memberCheckParam, async function (error, rows) {
                    if (error) {
                        console.error(error)
                        return res.status(500).json({
                            content: "DB Error"
                        })
                    } else {
                        if (rows.length === 0) {
                            return res.status(401).json({
                                content: false
                            })
                        } else if (rows[0].member_secede === 1 || rows[0].member_ban === 1) {
                            return res.status(401).json({
                                content: false
                            })
                        } else {
                            const decodedAccessToken = await jwt.verify(accessToken)

                            if (decodedAccessToken === TOKEN_EXPIRED) {
                                // access token 만료, refresh token 검증.
                                const decodedRefreshToken = await jwt.verify(refreshToken)
                                let checkRefreshTokenSql = "select member_refresh_token from member_refresh_token where member_email = ?;"
                                let checkRefreshTokenParam = [req.body.member_email]
                                conn.query(checkRefreshTokenSql, checkRefreshTokenParam, function (error, rows) {
                                    if (error) {
                                        console.error(error)
                                        res.status(500).json({
                                            content: "DB Error"
                                        })
                                    } else {
                                        if (rows.length === 0)
                                            res.status(401).json({
                                                content: "invalid token"
                                            })
                                        else {
                                            // Server DataBase에 있는 Refresh Token과 요청과 함께 보낸 Refresh Token이 다를 경우.
                                            if (rows[0].member_refresh_token !== req.headers.refresh_token) {
                                                res.status(401).json({
                                                    content: "invalid token"
                                                })
                                            } else {
                                                if (decodedRefreshToken === TOKEN_INVALID)
                                                    res.status(401).json({
                                                        content: "invalid token"
                                                    })
                                                // access token, refresh token 만료.
                                                else if (decodedRefreshToken === TOKEN_EXPIRED) {
                                                    let deleteRefreshTokenSql = "delete from member_refresh_token where member_email = ?"
                                                    let deleteRefreshTokenParam = [req.body.member_email]
                                                    conn.beginTransaction()
                                                    conn.query(deleteRefreshTokenSql, deleteRefreshTokenParam, function (error) {
                                                        if (error) {
                                                            conn.rollback()
                                                            console.error(error)
                                                            res.status(500).json({
                                                                content: "DB Error"
                                                            })
                                                        } else {
                                                            console.log("delete expired refresh token.")
                                                        }
                                                    })
                                                    // sliding session + access token + refresh token
                                                    // refresh token을 재발급 해줌.(만료기간을 늘려줌)
                                                    const user = {
                                                        email: req.body.member_email
                                                    }
                                                    jwt.sign(user).then(result => {
                                                        let newAccessToken, newRefreshToken
                                                        newAccessToken = result.access_token
                                                        newRefreshToken = result.refresh_token

                                                        req.headers.access_token = newAccessToken
                                                        req.headers.refresh_token = newRefreshToken
                                                        // 두 토큰 모두 재발급 된 경우
                                                        req.respFlag = 2

                                                        let insertNewRefreshTokenSql = "insert into member_refresh_token(member_email, member_refresh_token) values(?, ?);"
                                                        let insertNewRefreshTokenParam = [req.body.member_email, newRefreshToken]
                                                        conn.query(insertNewRefreshTokenSql, insertNewRefreshTokenParam, function (error) {
                                                            if (error) {
                                                                conn.rollback()
                                                                console.error(error)
                                                                res.status(500).json({
                                                                    content: "DB Error"
                                                                })
                                                            } else {
                                                                console.log("Success.")
                                                            }
                                                        })

                                                        let memberLogUpdate = "update member_log set member_login_lately = ? where member_log.member_email = ?;"
                                                        let today = moment(new Date()).format("YYYY-MM-DD HH:mm:ss")
                                                        let memberLogParam = [today, req.body.member_email]
                                                        conn.query(memberLogUpdate, memberLogParam, function (error) {
                                                            if (error) {
                                                                conn.rollback()
                                                                console.error(error)
                                                                res.status(500).json({
                                                                    content: "DB Error"
                                                                })
                                                            } else
                                                                console.log("update query is executed.")
                                                        })

                                                        let memberLoginLogInsert = "insert into member_login_log(member_email, member_login) values(?, ?);"
                                                        let memberLoginLogParam = [req.body.member_email, today]
                                                        conn.query(memberLoginLogInsert, memberLoginLogParam, function (error) {
                                                            if (error) {
                                                                conn.rollback()
                                                                console.error(error)
                                                                res.status(500).json({
                                                                    content: "DB Error"
                                                                })
                                                            } else {
                                                                conn.commit()
                                                                console.log("insert query is executed.")
                                                            }
                                                        })
                                                        next()
                                                    }).catch(error => {
                                                        conn.rollback()
                                                        console.error(error)
                                                    })
                                                } else {
                                                    // access token 만료, refresh token 유효.
                                                    // 새로운 access token 발급.
                                                    const user = {
                                                        email: req.body.member_email
                                                    }
                                                    jwt.sign(user).then(result => {
                                                        req.headers.access_token = result.access_token
                                                        // access token만 재발급 된 경우.
                                                        req.respFlag = 1

                                                        let memberLogUpdate = "update member_log set member_login_lately = ? where member_log.member_email = ?;"
                                                        let today = moment(new Date()).format("YYYY-MM-DD HH:mm:ss")
                                                        let memberLogParam = [today, req.body.member_email]
                                                        conn.beginTransaction()
                                                        conn.query(memberLogUpdate, memberLogParam, function (error) {
                                                            if (error) {
                                                                conn.rollback()
                                                                console.error(error)
                                                                res.status(500).json({
                                                                    content: "DB Error"
                                                                })
                                                            } else
                                                                console.log("update query is executed.")
                                                        })

                                                        let memberLoginLogInsert = "insert into member_login_log(member_email, member_login) values(?, ?);"
                                                        let memberLoginLogParam = [req.body.member_email, today]
                                                        conn.query(memberLoginLogInsert, memberLoginLogParam, function (error) {
                                                            if (error) {
                                                                conn.rollback()
                                                                console.error(error)
                                                                res.status(500).json({
                                                                    content: "DB Error"
                                                                })
                                                            } else {
                                                                conn.commit()
                                                                console.log("insert query is executed.")
                                                            }
                                                        })

                                                        next()
                                                    }).catch(error => {
                                                        console.error(error)
                                                    })
                                                }
                                            }
                                        }
                                    }
                                })
                            } else if (decodedAccessToken === TOKEN_INVALID)
                                return res.status(401).json({
                                    content: "invalid token"
                                })
                            else if (decodedAccessToken.email === undefined)
                                return res.status(401).json({
                                    content: "invalid token"
                                })
                            else {
                                req.isEmptyToken = 0
                                // 모두 유효한 경우(아무 것도 재발급 되지 않은 경우)
                                req.respFlag = 0

                                // access token 유효.
                                let memberLogUpdate = "update member_log set member_login_lately = ? where member_log.member_email = ?;"
                                let today = moment(new Date()).format("YYYY-MM-DD HH:mm:ss")
                                let memberLogParam = [today, decodedAccessToken.email]
                                conn.beginTransaction()
                                conn.query(memberLogUpdate, memberLogParam, function (error) {
                                    if (error) {
                                        conn.rollback()
                                        console.error(error)
                                        res.status(500).json({
                                            content: "DB Error"
                                        })
                                    } else
                                        console.log("update query is executed.")
                                })

                                let memberLoginLogInsert = "insert into member_login_log(member_email, member_login) values(?, ?);"
                                let memberLoginLogParam = [decodedAccessToken.email, today]
                                conn.query(memberLoginLogInsert, memberLoginLogParam, function (error) {
                                    if (error) {
                                        conn.rollback()
                                        console.error(error)
                                        res.status(500).json({
                                            content: "DB Error"
                                        })
                                    } else {
                                        conn.commit()
                                        console.log("insert query is executed.")
                                    }
                                })
                                next()
                            }
                        }
                    }
                    conn.release()
                })
            })
        }
    }
}

module.exports = authenticationUtil