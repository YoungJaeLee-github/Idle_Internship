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
            let insertCsSql = "insert into cs(cs_title, cs_contents, cs_date, member_email, cs_secret, cs_delete)"
        })
    }
})

module.exports = app;