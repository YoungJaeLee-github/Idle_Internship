/**
 * --------------------------------------------------------------------------------------------------------
 * 모듈/필드 변수 부분
 * --------------------------------------------------------------------------------------------------------
 */
const express = require("express")
const app = express.Router()
const getConnection = require("../config/database_config.js").getConnection
const sessionConfig = require("../config/session_config.js")
const func = require("../config/crypto_config.js")
const logger = require("../config/winston_config.js").logger
const moment = require("moment")
app.use(sessionConfig.init())

/**
 * --------------------------------------------------------------------------------------------------------
 * API 구현 부분
 * --------------------------------------------------------------------------------------------------------
 */

/**
 * 포인트 API
 */
// 1. 포인트 현황 조회(사용자)
app.get("/now", (req, res) => {
    if (req.session.member_email === undefined) {
        res.status(401).json({
            content: false
        })
    } else {
        getConnection((conn) => {
            let memberCheckSql = "select member_ban, member_secede from member where member_email = ?"
            let memberCheckParam = [req.session.member_email]
            conn.query(memberCheckSql, memberCheckParam, function (error, rows) {
                if (error) {
                    console.error(error)
                    res.status(500).json({
                        content: "DB Error"
                    })
                } else {
                    if (rows.length === 0) {
                        res.status(404).json({
                            content: false
                        })
                    } else {
                        if (rows[0].member_ban === 1 || rows[0].member_secede === 1) {
                            res.status(401).json({
                                content: false
                            })
                        } else {
                            let searchPointSql = "select member_rank, member_point, save_point, use_point from member where member_email = ?"
                            let searchPointParam = [req.session.member_email]
                            conn.query(searchPointSql, searchPointParam, function (error, rows) {
                                if (error) {
                                    console.error(error)
                                    res.status(500).json({
                                        content: "DB Error"
                                    })
                                } else {
                                    if (rows.length === 0) {
                                        res.status(401).json({
                                            content: false
                                        })
                                    } else {
                                        let pointInfoStruct = []
                                        pointInfoStruct.push({
                                            member_rank: rows[0].member_rank,
                                            member_point: rows[0].member_point,
                                            save_point: rows[0].save_point,
                                            use_point: rows[0].use_point
                                        })
                                        res.status(200).json({
                                            pointInfoStruct
                                        })
                                    }
                                }
                            })
                        }
                    }
                }
                conn.release()
            })
        })
    }
})

// 2. 포인트 사용내역 조회(사용자)
app.get("/use-history", (req, res) => {
    if (req.session.member_email === undefined)
        res.status(401).json({
            content: false
        })
    else {
        getConnection((conn) => {
            let memberCheckSql = "select member_ban, member_secede from member where member_email = ?;"
            let memberCheckParam = [req.session.member_email]
            conn.query(memberCheckSql, memberCheckParam, function (error, rows) {
                if (error) {
                    console.error(error)
                    res.status(500).json({
                        content: "DB Error"
                    })
                } else {
                    if (rows.length === 0)
                        res.status(404).json({
                            content: false
                        })
                    else {
                        if (rows[0].member_ban === 1 || rows[0].member_secede === 1)
                            res.status(401).json({
                                content: false
                            })
                        else {
                            let getCountSql = "select count(*) as count from point where member_email = ?;"
                            let getCountParam = [req.session.member_email]
                            conn.query(getCountSql, getCountParam, function (error, rows) {
                                if (error) {
                                    console.error(error)
                                    res.status(500).json({
                                        content: "DB Error"
                                    })
                                } else {
                                    if (rows.length === 0 || rows[0].count === 0) {
                                        res.status(404).json({
                                            content: false
                                        })
                                    } else {
                                        let pageSize = 15
                                        if (rows[0].count > pageSize) {
                                            if (req.query.page === undefined || req.query.page === "")
                                                res.status(401).json({
                                                    content: "empty page number"
                                                })
                                            else {
                                                let page = req.query.page
                                                let start = 0
                                                if (page <= 0)
                                                    page = 1
                                                else
                                                    start = (page - 1) * pageSize
                                                const totalPageCount = rows[0].count
                                                if (page > Math.ceil(totalPageCount / pageSize))
                                                    res.status(404).json({
                                                        content: "over page"
                                                    })
                                                else {
                                                    let searchPointSql = "select use_contents, point, use_date from point where member_email = ? limit ?, ?;"
                                                    let searchPointParam = [req.session.member_email, start, pageSize]
                                                    conn.query(searchPointSql, searchPointParam, function (error, rows) {
                                                        if (error) {
                                                            console.error(error)
                                                            res.status(500).json({
                                                                content: "DB Error"
                                                            })
                                                        } else {
                                                            if (rows.length === 0)
                                                                res.status(404).json({
                                                                    content: false
                                                                })
                                                            else {
                                                                let pointInfoStruct = []
                                                                for (let i = 0; i < rows.length; i++) {
                                                                    pointInfoStruct.push({
                                                                        use_contents: rows[i].use_contents,
                                                                        point: rows[i].point,
                                                                        use_date: rows[i].use_date
                                                                    })
                                                                }
                                                                res.status(200).json({
                                                                    pointInfoStruct
                                                                })
                                                            }
                                                        }
                                                    })
                                                }
                                            }
                                        } else {
                                            let searchPointSql = "select use_contents, point, use_date from point where member_email = ? limit ?, ?;"
                                            let searchPointParam = [req.session.member_email, 0, rows[0].count]
                                            conn.query(searchPointSql, searchPointParam, function (error, rows) {
                                                if (error) {
                                                    console.error(error)
                                                    res.status(500).json({
                                                        content: "DB Error"
                                                    })
                                                } else {
                                                    if (rows.length === 0)
                                                        res.status(404).json({
                                                            content: false
                                                        })
                                                    else {
                                                        let pointInfoStruct = []
                                                        for (let i = 0; i < rows.length; i++) {
                                                            pointInfoStruct.push({
                                                                use_contents: rows[i].use_contents,
                                                                point: rows[i].point,
                                                                use_date: rows[i].use_date
                                                            })
                                                        }
                                                        res.status(200).json({
                                                            pointInfoStruct
                                                        })
                                                    }
                                                }
                                            })
                                        }
                                    }
                                }
                            })
                        }
                    }
                }
                conn.release()
            })
        })
    }
})

// 3. 포인트 적립내역 조회(사용자)
app.get("/point-history", (req, res) => {
    if (req.session.member_email === undefined) {
        res.status(401).json({
            content: false
        })
    } else {
        getConnection((conn) => {
            let memberCheckSql = "select member_ban, member_secede from member where member_email = ?;"
            let memberCheckParam = [req.session.member_email]
            conn.query(memberCheckSql, memberCheckParam, function (error, rows) {
                if (error) {
                    console.error(error)
                    res.status(500).json({
                        content: "DB Error"
                    })
                } else {
                    if (rows.length === 0)
                        res.status(404).json({
                            content: false
                        })
                    else {
                        if (rows[0].member_ban === 1 || rows[0].member_secede === 1)
                            res.status(401).json({
                                content: false
                            })
                        else {
                            let getCountSql = "select count(*) as count from idea where member_email = ? and idea_delete != ?;"
                            let getCountParam = [req.session.member_email, 1]
                            conn.query(getCountSql, getCountParam, function (error, rows) {
                                if (error) {
                                    console.error(error)
                                    res.status(500).json({
                                        content: "DB Error"
                                    })
                                } else {
                                    if (rows.length === 0 || rows[0].count === 0) {
                                        res.status(404).json({
                                            content: false
                                        })
                                    } else {
                                        let pageSize = 15
                                        if (rows[0].count > pageSize) {
                                            if (req.query.page === undefined || req.query.page === "")
                                                res.status(401).json({
                                                    content: "empty page number"
                                                })
                                            else {
                                                let page = req.query.page
                                                let start = 0
                                                if (page <= 0)
                                                    page = 1
                                                else
                                                    start = (page - 1) * pageSize
                                                const totalPageCount = rows[0].count
                                                if (page > Math.ceil(totalPageCount / pageSize))
                                                    res.status(404).json({
                                                        content: "over page"
                                                    })
                                                else {
                                                    let searchIdeaPointSql = "select idea_title, add_point, date_point, idea_date from idea where member_email = ? and idea_delete != ? limit ?, ?;"
                                                    let searchIdeaPointParam = [req.session.member_email, 1, start, pageSize]
                                                    conn.query(searchIdeaPointSql, searchIdeaPointParam, function (error, rows) {
                                                        if (error) {
                                                            console.error(error)
                                                            res.status(500).json({
                                                                content: "DB Error"
                                                            })
                                                        } else {
                                                            if (rows.length === 0)
                                                                res.status(404).json({
                                                                    content: false
                                                                })
                                                            else {
                                                                let ideaPointStruct = []
                                                                for (let i = 0; i < rows.length; i++) {
                                                                    if (rows[i].date_point === null) {
                                                                        ideaPointStruct.push({
                                                                            idea_title: rows[i].idea_title,
                                                                            add_point: rows[i].add_point,
                                                                            date_point: rows[i].idea_date
                                                                        })
                                                                    } else {
                                                                        ideaPointStruct.push({
                                                                            idea_title: rows[i].idea_title,
                                                                            add_point: rows[i].add_point,
                                                                            date_point: rows[i].date_point
                                                                        })
                                                                    }
                                                                }
                                                                res.status(200).json({
                                                                    ideaPointStruct
                                                                })
                                                            }
                                                        }
                                                    })
                                                }
                                            }
                                        } else {
                                            let searchIdeaPointSql = "select idea_title, add_point, date_point, idea_date from idea where member_email = ? and idea_delete != ? limit ?, ?;"
                                            let searchIdeaPointParam = [req.session.member_email, 1, 0, rows[0].count]
                                            conn.query(searchIdeaPointSql, searchIdeaPointParam, function (error, rows) {
                                                if (error) {
                                                    console.error(error)
                                                    res.status(500).json({
                                                        content: "DB Error"
                                                    })
                                                } else {
                                                    if (rows.length === 0)
                                                        res.status(404).json({
                                                            content: false
                                                        })
                                                    else {
                                                        let ideaPointStruct = []
                                                        for (let i = 0; i < rows.length; i++) {
                                                            if (rows[i].date_point === null) {
                                                                ideaPointStruct.push({
                                                                    idea_title: rows[i].idea_title,
                                                                    add_point: rows[i].add_point,
                                                                    date_point: rows[i].idea_date
                                                                })
                                                            } else {
                                                                ideaPointStruct.push({
                                                                    idea_title: rows[i].idea_title,
                                                                    add_point: rows[i].add_point,
                                                                    date_point: rows[i].date_point
                                                                })
                                                            }
                                                        }
                                                        res.status(200).json({
                                                            ideaPointStruct
                                                        })
                                                    }
                                                }
                                            })
                                        }
                                    }
                                }
                            })
                        }
                    }
                }
                conn.release()
            })
        })
    }
})

// 4. 포인트 사용 요청(사용자)
app.post("/use-point", (req, res) => {
    if (req.session.member_email === undefined || req.body.use_point === undefined)
        res.status(401).json({
            content: false
        })
    else {
        getConnection((conn) => {
            let memberCheckSql = "select member_ban, member_secede from member where member_email = ?;"
            let memberCheckParam = [req.session.member_email]
            conn.query(memberCheckSql, memberCheckParam, function (error, rows) {
                if (error) {
                    console.error(error)
                    res.status(500).json({
                        content: "DB Error"
                    })
                } else {
                    if (rows.length === 0)
                        res.status(404).json({
                            content: false
                        })
                    else {
                        if (rows[0].member_ban === 1 || rows[0].member_secede === 1)
                            res.status(401).json({
                                content: false
                            })
                        else {
                            let todoUsePoint = 500
                            let checkPointSql = "select member_point from member where member_email = ?"
                            let checkPointParam = [req.session.member_email]
                            conn.query(checkPointSql, checkPointParam, function (error, rows) {
                                if (error) {
                                    console.error(error)
                                    res.status(500).json({
                                        content: "DB Error"
                                    })
                                } else {
                                    if (rows.length === 0)
                                        res.status(404).json({
                                            content: false
                                        })
                                    else {
                                        if (rows[0].member_point < todoUsePoint)
                                            res.status(401).json({
                                                content: false
                                            })
                                        else {
                                            func.generateKey().then(useCode => {
                                                let requestPointSql = "insert into point(member_email, use_date, use_contents, point, accept_flag, use_code) values(?, ?, ?, ?, ?, ?);"
                                                let requestPointParam = [req.session.member_email, moment(new Date()).format("YYYY-MM-DD HH:mm:ss"), "사용", 500, 0, useCode]
                                                conn.query(requestPointSql, requestPointParam, function (error) {
                                                    if (error) {
                                                        console.error(error)
                                                        res.status(500).json({
                                                            content: "DB Error"
                                                        })
                                                    } else {
                                                        res.status(200).json({
                                                            content: true
                                                        })
                                                    }
                                                })
                                            }).catch(error => {
                                                console.error(error)
                                            })
                                        }
                                    }
                                }
                            })
                        }
                    }
                }
                conn.release()
            })
        })
    }
})

module.exports = app;