/**
 * --------------------------------------------------------------------------------------------------------
 * 모듈/필드 변수 부분
 * --------------------------------------------------------------------------------------------------------
 */
const express = require("express")
const app = express.Router()
const sessionConfig = require("../config/session_config.js")
const getConnection = require("../config/database_config.js").getConnection
const logger = require("../config/winston_config.js").logger
app.use(sessionConfig.init())

/**
 * --------------------------------------------------------------------------------------------------------
 * API 구현 부분
 * --------------------------------------------------------------------------------------------------------
 */

/**
 * 고객센터 API
 */
// 1. 고객센터 문의글 이메일 가져오기
app.post("/", (req, res) => {
    if (req.session.member_email === undefined)
        res.status(200).json({
            content: "empty"
        })
    else {
        getConnection((conn) => {
            let searchMemberEmailSql = "select member_ban, member_secede from member where member_email = ?"
            let searchMemberEmailParam = [req.session.member_email]
            conn.query(searchMemberEmailSql, searchMemberEmailParam, function (error, rows) {
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
                        if (rows[0].member_ban === 1 || rows[0].member_secede === 1)
                            res.status(401).json({
                                content: false
                            })
                        else {
                            res.status(200).json({
                                member_email: req.session.member_email
                            })
                        }
                    }
                }
                conn.query
            })
        })
    }
})

// 2. 고객센터 문의글 작성
app.post("/regist", (req, res) => {
    if (req.body.email === undefined || req.body.contact_title === undefined || req.body.contact_contents === undefined)
        res.status(401).json({
            content: false
        })
    else {
        getConnection((conn) => {
            let memberBanCheckSql = "select member_ban from member where member_email = ?"
            let memberBanCheckParam = [req.body.email]
            conn.query(memberBanCheckSql, memberBanCheckParam, function (error, rows) {
                if (error) {
                    console.error(error)
                    res.status(500).json({
                        content: "DB Error"
                    })
                } else {
                    let insertContactSql = "insert into contact(email, contact_title, contact_contents) values(" +
                        conn.escape(req.body.email) + ", " + conn.escape(req.body.contact_title) + ", " +
                        conn.escape(req.body.contact_contents) + ");"
                    insertContactSql += "insert into contact_log(contact_id, contact_send) values((select contact_id from contact where email = " +
                        conn.escape(req.body.email) + " order by contact_id desc limit " + conn.escape(1) + "), " + conn.escape("NOW()") + ");"
                    if (rows.length === 0) {
                        conn.query(insertContactSql, function (error) {
                            if (error) {
                                console.error(error)
                                res.status(500).json({
                                    content: "DB Error"
                                })
                            } else {
                                console.log("Success insert contact data.")
                                res.status(200).json({
                                    content: true
                                })
                            }
                        })
                    } else {
                        if (rows[0].member_ban === 1) {
                            res.status(401).json({
                                content: false
                            })
                        } else {
                            conn.query(insertContactSql, function (error) {
                                if (error) {
                                    console.error(error)
                                    res.status(500).json({
                                        content: "DB Error"
                                    })
                                } else {
                                    console.log("Success insert contact data.")
                                    res.status(200).json({
                                        content: true
                                    })
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