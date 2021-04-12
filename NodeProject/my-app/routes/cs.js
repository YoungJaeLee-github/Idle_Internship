/**
 * --------------------------------------------------------------------------------------------------------
 * 모듈/필드 변수 부분
 * --------------------------------------------------------------------------------------------------------
 */
const express = require("express")
const upload = require("../config/multer_config.js").upload
const fs = require("fs")
const app = express.Router()
const getConnection = require("../config/database_config.js").getConnection
const sessionConfig = require("../config/session_config.js")
app.use(sessionConfig.init())

/**
 * --------------------------------------------------------------------------------------------------------
 * API 구현 부분
 * --------------------------------------------------------------------------------------------------------
 */

/**
 * 문의게시판 API
 */

// 1. 문의글 등록
app.post("/regist", upload.any(), (req, res) => {
    if (req.session.member_email === undefined || req.body.cs_contents === undefined || req.body.cs_title === undefined || req.body.cs_secret === undefined) {
        for (let i = 0; i < req.files.length; i++) {
            fs.unlink(req.files[i].path, (error) => error ? console.error(error) : console.log("Success delete file"))
        }
        res.status(401).json({
            content: false
        })
    } else {
        getConnection((conn) => {
            let checkMemberSql = "select member_ban, member_secede from member where member_email = ?"
            let checkMemberParam = [req.session.member_email]
            conn.query(checkMemberSql, checkMemberParam, function (error, rows) {
                if (error) {
                    console.error(error)
                    res.status(500).json({
                        content: "DB Error"
                    })
                } else {
                    if (rows.length === 0)
                        res.status(401).json({
                            content: false
                        })
                    else {
                        if (rows[0].member_ban === 1 || rows[0].member_secede === 1)
                            res.status(401).json({
                                content: false
                            })
                        else {
                            let insertCsSql = "insert into cs(cs_title, cs_contents, cs_date, member_email, cs_secret, cs_delete)" +
                                "values(?, ?, ?, ?, ?, ?)"
                            let insertCsParam = [req.body.cs_title, req.body.cs_contents, new Date(), req.session.member_email, req.body.cs_secret, 0]
                            conn.query(insertCsSql, insertCsParam, function (error) {
                                if (error) {
                                    console.error(error)
                                    res.status(500).json({
                                        content: "DB Error"
                                    })
                                } else {
                                    if (Object.keys(req.files).length === 0) {
                                        console.log("insert cs success.")
                                        res.status(200).json({
                                            content: true
                                        })
                                    } else {
                                        let insertFileSql = ""
                                        for (let i = 0; i < req.files.length; i++) {
                                            insertFileSql += "insert into cs_file_dir(cs_file_name, cs_file_path, cs_id) values(" + conn.escape(req.files[i].originalname) +
                                                ", " + conn.escape(req.files[i].path) + ", " + "(select cs_id from cs where member_email = " + conn.escape(req.session.member_email) +
                                                " order by cs_id desc limit " + conn.escape(1) + "));"
                                        }
                                        conn.query(insertFileSql, function (error) {
                                            if (error) {
                                                console.error(error)
                                                res.status(500).json({
                                                    content: "DB Error"
                                                })
                                            } else {
                                                console.log("insert cs & file success.")
                                                res.status(200).json({
                                                    content: true
                                                })
                                            }
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

// 2. 문의글 조회(사용자)
app.get("/list", (req, res) => {
    getConnection((conn) => {
        let searchCsSql = "select cs_title, member.member_name, cs_date, cs_secret from cs join member where cs.member_email = member.member_email\n" +
            "and cs_delete != ? and member.member_ban != ? and member.member_secede != ? order by cs_id desc limit ?;"
        let searchCsParam = [1, 1, 1, 15]
        conn.query(searchCsSql, searchCsParam, function (error, rows) {
            if (error) {
                console.error(error)
                res.status(500).json({
                    content: "DB Error"
                })
            } else {
                if (rows.length === 0)
                    res.status(401).json({
                        content: false
                    })
                else {
                    let csStruct = []
                    for (let i = 0; i < rows.length; i++) {
                        if (rows[i].cs_secret === 1) {
                            csStruct.push({
                                cs_title: "[비밀글] " + rows[i].cs_title,
                                member_name: rows[i].member_name,
                                cs_date: rows[i].cs_date
                            })
                        } else {
                            csStruct.push({
                                cs_title: rows[i].cs_title,
                                member_name: rows[i].member_name,
                                cs_date: rows[i].cs_date
                            })
                        }
                    }
                    res.status(200).json({
                        csStruct
                    })
                }
            }
            conn.release()
        })
    })
})

module.exports = app;