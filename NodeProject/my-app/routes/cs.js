/**
 * --------------------------------------------------------------------------------------------------------
 * 모듈/필드 변수 부분
 * --------------------------------------------------------------------------------------------------------
 */
const express = require("express")
const upload = require("../config/multer_config.js").upload
const fs = require("fs")
const path = require("path")
const app = express.Router()
const getConnection = require("../config/database_config.js").getConnection
const logger = require("../config/winston_config.js").logger
const moment = require("moment")
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
                    for (let i = 0; i < req.files.length; i++) {
                        fs.unlink(req.files[i].path, (error) => error ? console.error(error) : console.log("Success delete file"))
                    }
                    console.error(error)
                    res.status(500).json({
                        content: "DB Error"
                    })
                } else {
                    if (rows.length === 0) {
                        for (let i = 0; i < req.files.length; i++) {
                            fs.unlink(req.files[i].path, (error) => error ? console.error(error) : console.log("Success delete file"))
                        }
                        res.status(401).json({
                            content: false
                        })
                    } else {
                        if (rows[0].member_ban === 1 || rows[0].member_secede === 1) {
                            for (let i = 0; i < req.files.length; i++) {
                                fs.unlink(req.files[i].path, (error) => error ? console.error(error) : console.log("Success delete file"))
                            }
                            res.status(401).json({
                                content: false
                            })
                        } else {
                            let insertCsSql = "insert into cs(cs_title, cs_contents, cs_date, member_email, cs_secret, cs_delete)" +
                                "values(?, ?, ?, ?, ?, ?)"
                            let insertCsParam = [req.body.cs_title, req.body.cs_contents, moment(new Date()).format("YYYY-MM-DD"), req.session.member_email, req.body.cs_secret, 0]
                            conn.query(insertCsSql, insertCsParam, function (error) {
                                if (error) {
                                    for (let i = 0; i < req.files.length; i++) {
                                        fs.unlink(req.files[i].path, (error) => error ? console.error(error) : console.log("Success delete file"))
                                    }
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
                                                for (let i = 0; i < req.files.length; i++) {
                                                    fs.unlink(req.files[i].path, (error) => error ? console.error(error) : console.log("Success delete file"))
                                                }
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
        let getCountSql = "select count(*) as count from cs join member on cs.member_email = member.member_email where member_secede != ? and member_ban != ? and cs_delete != ?;"
        let getCountParam = [1, 1, 1]
        conn.query(getCountSql, getCountParam, function(error, rows) {
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
                                let searchCsSql = "select cs_title, member.member_name, cs_date, cs_secret, admin.admin_name, cs_resp_date from cs left join member on cs.member_email = member.member_email left join admin on cs.admin_email = admin.admin_email where cs_delete != ? and member.member_ban != ? and member.member_secede != ? order by cs_id desc limit ?, ?;"
                                let searchCsParam = [1, 1, 1, start, pageSize]
                                conn.query(searchCsSql, searchCsParam, function (error, rows) {
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
                                            let csStruct = []
                                            for (let i = 0; i < rows.length; i++) {
                                                // 답변이 없는 경우.
                                                if (rows[i].cs_resp_date === null) {
                                                    // 비밀글인 경우
                                                    if (rows[i].cs_secret === 1) {
                                                        csStruct.push({
                                                            cs_title: "[비밀글] " + rows[i].cs_title,
                                                            member_name: rows[i].member_name,
                                                            cs_date: rows[i].cs_date
                                                        })
                                                    } else {
                                                        // 비밀글이 아닌 경우
                                                        csStruct.push({
                                                            cs_title: rows[i].cs_title,
                                                            member_name: rows[i].member_name,
                                                            cs_date: rows[i].cs_date
                                                        })
                                                    }
                                                } else {
                                                    //답변이 있는 경우
                                                    // 비밀글인 경우
                                                    if (rows[i].cs_secret === 1) {
                                                        csStruct.push({
                                                            cs_title: "[비밀글] " + rows[i].cs_title,
                                                            member_name: rows[i].member_name,
                                                            cs_date: rows[i].cs_date,
                                                            cs_resp_title: "[비밀글] RE : " + rows[i].cs_title,
                                                            admin_name: rows[i].admin_name,
                                                            cs_resp_date: rows[i].cs_resp_date
                                                        })
                                                    } else {
                                                        // 비밀글이 아닌 경우
                                                        csStruct.push({
                                                            cs_title: rows[i].cs_title,
                                                            member_name: rows[i].member_name,
                                                            cs_date: rows[i].cs_date,
                                                            cs_resp_title: "RE : " + rows[i].cs_title,
                                                            admin_name: rows[i].admin_name,
                                                            cs_resp_date: rows[i].cs_resp_date
                                                        })
                                                    }
                                                }
                                            }
                                            console.log("Success Search cs.")
                                            res.status(200).json({
                                                csStruct
                                            })
                                        }
                                    }
                                })
                            }
                        }
                    } else {
                        let searchCsSql = "select cs_title, member.member_name, cs_date, cs_secret, admin.admin_name, cs_resp_date from cs left join member on cs.member_email = member.member_email left join admin on cs.admin_email = admin.admin_email where cs_delete != ? and member.member_ban != ? and member.member_secede != ? order by cs_id desc limit ?, ?;"
                        let searchCsParam = [1, 1, 1, 0, rows[0].count]
                        conn.query(searchCsSql, searchCsParam, function (error, rows) {
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
                                    let csStruct = []
                                    for (let i = 0; i < rows.length; i++) {
                                        // 답변이 없는 경우.
                                        if (rows[i].cs_resp_date === null) {
                                            // 비밀글인 경우
                                            if (rows[i].cs_secret === 1) {
                                                csStruct.push({
                                                    cs_title: "[비밀글] " + rows[i].cs_title,
                                                    member_name: rows[i].member_name,
                                                    cs_date: rows[i].cs_date
                                                })
                                            } else {
                                                // 비밀글이 아닌 경우
                                                csStruct.push({
                                                    cs_title: rows[i].cs_title,
                                                    member_name: rows[i].member_name,
                                                    cs_date: rows[i].cs_date
                                                })
                                            }
                                        } else {
                                            //답변이 있는 경우
                                            // 비밀글인 경우
                                            if (rows[i].cs_secret === 1) {
                                                csStruct.push({
                                                    cs_title: "[비밀글] " + rows[i].cs_title,
                                                    member_name: rows[i].member_name,
                                                    cs_date: rows[i].cs_date,
                                                    cs_resp_title: "[비밀글] RE : " + rows[i].cs_title,
                                                    admin_name: rows[i].admin_name,
                                                    cs_resp_date: rows[i].cs_resp_date
                                                })
                                            } else {
                                                // 비밀글이 아닌 경우
                                                csStruct.push({
                                                    cs_title: rows[i].cs_title,
                                                    member_name: rows[i].member_name,
                                                    cs_date: rows[i].cs_date,
                                                    cs_resp_title: "RE : " + rows[i].cs_title,
                                                    admin_name: rows[i].admin_name,
                                                    cs_resp_date: rows[i].cs_resp_date
                                                })
                                            }
                                        }
                                    }
                                    console.log("Success Search cs.")
                                    res.status(200).json({
                                        csStruct
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
})

// 3. 문의글 상세 조회(사용자)
app.get("/detail", (req, res) => {
    if (req.query.cs_id === undefined) {
        res.status(401).json({
            content: false
        })
    } else {
        getConnection((conn) => {
            let searchDetailSql = "select cs_title, cs.member_email, member.member_name, cs_date, cs_contents, cs_file_dir.cs_file_name, cs_secret from cs left join member on cs.member_email = member.member_email left join cs_file_dir on cs.cs_id = cs_file_dir.cs_id where cs_delete != ? and member.member_ban != ? and member.member_secede != ? and cs.cs_id = ?;"
            let searchDetailParam = [1, 1, 1, req.query.cs_id]
            conn.query(searchDetailSql, searchDetailParam, function (error, rows) {
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
                        let csDetailStruct = []
                        if (rows[0].cs_secret === 1) {
                            if (req.session.member_email === rows[0].member_email) {
                                if (rows[0].cs_file_name === null) {
                                    csDetailStruct.push({
                                        cs_title: rows[0].cs_title,
                                        member_name: rows[0].member_name,
                                        cs_date: rows[0].cs_date,
                                        cs_contents: rows[0].cs_contents
                                    })
                                } else {
                                    for (let i = 0; i < rows.length; i++) {
                                        csDetailStruct.push({
                                            cs_title: rows[i].cs_title,
                                            member_name: rows[i].member_name,
                                            cs_date: rows[i].cs_date,
                                            cs_contents: rows[i].cs_contents,
                                            cs_file_name: rows[i].cs_file_name
                                        })
                                    }
                                }
                                res.status(200).json({
                                    csDetailStruct
                                })
                            } else {
                                res.status(401).json({
                                    content: false
                                })
                            }
                        } else {
                            if (rows[0].cs_file_name === null) {
                                csDetailStruct.push({
                                    cs_title: rows[0].cs_title,
                                    member_name: rows[0].member_name,
                                    cs_date: rows[0].cs_date,
                                    cs_contents: rows[0].cs_contents
                                })
                            } else {
                                for (let i = 0; i < rows.length; i++) {
                                    csDetailStruct.push({
                                        cs_title: rows[i].cs_title,
                                        member_name: rows[i].member_name,
                                        cs_date: rows[i].cs_date,
                                        cs_contents: rows[i].cs_contents,
                                        cs_file_name: rows[i].cs_file_name
                                    })
                                }
                            }
                            res.status(200).json({
                                csDetailStruct
                            })
                        }
                    }
                }
                conn.release()
            })
        })
    }
})

// 4. 문의글 답변 상세 조회(사용자)
app.get("/resp/detail", (req, res) => {
    if (req.query.cs_id === undefined)
        res.status(401).json({
            content: false
        })
    else {
        getConnection((conn) => {
            let searchRespDetailSql = "select cs_title, admin.admin_name, cs_resp_date, cs_resp, cs_secret, cs.member_email from cs left join member on cs.member_email = member.member_email left join admin on cs.admin_email = admin.admin_email where cs_delete != ? and member.member_ban != ? and member.member_secede != ? and cs_id = ?"
            let searchRespDetailParam = [1, 1, 1, req.query.cs_id]
            conn.query(searchRespDetailSql, searchRespDetailParam, function (error, rows) {
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
                        if (rows[0].cs_resp_date === null) {
                            res.status(401).json({
                                content: false
                            })
                        } else {
                            let csRespDetailStruct = []
                            if (rows[0].cs_secret === 1) {
                                if (req.session.member_email === rows[0].member_email) {
                                    csRespDetailStruct.push({
                                        cs_resp_title: "RE : " + rows[0].cs_title,
                                        admin_name: rows[0].admin_name,
                                        cs_resp_date: rows[0].cs_resp_date,
                                        cs_resp: rows[0].cs_resp
                                    })
                                    res.status(200).json({
                                        csRespDetailStruct
                                    })
                                } else {
                                    res.status(401).json({
                                        content: false
                                    })
                                }
                            } else {
                                csRespDetailStruct.push({
                                    cs_resp_title: "RE : " + rows[0].cs_title,
                                    admin_name: rows[0].admin_name,
                                    cs_resp_date: rows[0].cs_resp_date,
                                    cs_resp: rows[0].cs_resp
                                })
                                res.status(200).json({
                                    csRespDetailStruct
                                })
                            }
                        }
                    }
                }
                conn.release()
            })
        })
    }
})

// 5. 문의글 첨부파일 다운로드(사용자)
app.post("/download", (req, res) => {
    if (req.body.cs_id === undefined || req.body.cs_file_name === undefined)
        res.status(401).json({
            content: false
        })
    else {
        getConnection((conn) => {
            let searchCsFileSql = "select cs_file_path, cs_secret, cs.member_email from cs_file_dir join cs on cs_file_dir.cs_id = cs.cs_id join member on cs.member_email = member.member_email where cs_delete != ? and member_secede != ? and member_ban != ? and cs_file_name = ? and cs_file_dir.cs_id = ?;"
            let searchCsFileParam = [1, 1, 1, req.body.cs_file_name, req.body.cs_id]
            conn.query(searchCsFileSql, searchCsFileParam, function (error, rows) {
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
                        if (rows[0].cs_secret === 1) {
                            if (rows[0].member_email === req.session.member_email) {
                                let file = rows[0].cs_file_path
                                try {
                                    if (fs.existsSync(file)) {
                                        let fileName = path.basename(file)
                                        res.status(200).setHeader("Content-disposition", "attachment; filename=" + fileName)
                                        let fileStream = fs.createReadStream(file)
                                        fileStream.pipe(res)
                                    } else {
                                        res.status(401).json({
                                            content: false
                                        })
                                    }
                                } catch (error) {
                                    console.error(error)
                                    res.status(401).json({
                                        content: false
                                    })
                                }
                            } else {
                                res.status(401).json({
                                    content: false
                                })
                            }
                        } else {
                            let file = rows[0].cs_file_path
                            try {
                                if (fs.existsSync(file)) {
                                    let fileName = path.basename(file)
                                    res.status(200).setHeader("Content-disposition", "attachment; filename=" + fileName)
                                    let fileStream = fs.createReadStream(file)
                                    fileStream.pipe(res)
                                } else {
                                    res.status(401).json({
                                        content: false
                                    })
                                }
                            } catch (error) {
                                console.error(error)
                                res.status(401).json({
                                    content: false
                                })
                            }
                        }
                    }
                }
                conn.release()
            })
        })
    }
})

// 6. 문의글 수정(사용자)
app.patch("/edit", upload.any(), (req, res) => {
    if (req.session.member_email === undefined || req.body.cs_contents === undefined || req.body.cs_title === undefined || req.body.cs_secret === undefined || req.body.cs_id === undefined) {
        for (let i = 0; i < req.files.length; i++) {
            fs.unlink(req.files[i].path, (error) => error ? console.error(error) : console.log("Success delete file"))
        }
        res.status(401).json({
            content: false
        })
    } else {
        getConnection((conn) => {
            let memberCheckSql = "select cs.member_email from cs join member on cs.member_email = member.member_email where member_ban != ? and member_secede != ? and cs_delete != ? and cs_id = ?;"
            let memberCheckParam = [1, 1, 1, req.body.cs_id]
            conn.query(memberCheckSql, memberCheckParam, function (error, rows) {
                if (error) {
                    console.error(error)
                    res.status(500).json({
                        content: "DB Error"
                    })
                } else {
                    if (rows.length === 0) {
                        for (let i = 0; i < req.files.length; i++) {
                            fs.unlink(req.files[i].path, (error) => error ? console.error(error) : console.log("Success delete file"))
                        }
                        res.status(401).json({
                            content: false
                        })
                    } else {
                        if (rows[0].member_email === req.session.member_email) {
                            let checkLogSql = "select cs_id from cs_log where cs_id = ?;"
                            let checkLogParam = [req.body.cs_id]
                            conn.query(checkLogSql, checkLogParam, function (error, rows) {
                                if (error) {
                                    for (let i = 0; i < req.files.length; i++) {
                                        fs.unlink(req.files[i].path, (error) => error ? console.error(error) : console.log("Success delete file"))
                                    }
                                    console.error(error)
                                    res.status(500).json({
                                        content: "DB Error"
                                    })
                                } else {
                                    let fileCheckSql = "select cs_id, cs_file_path from cs_file_dir where cs_id = ?;"
                                    let fileCheckParam = [req.body.cs_id]
                                    // 수정을 처음 하는 경우
                                    if (rows.length === 0) {
                                        if (Object.keys(req.files).length === 0) {
                                            conn.query(fileCheckSql, fileCheckParam, function (error, rows) {
                                                if (error) {
                                                    for (let i = 0; i < req.files.length; i++) {
                                                        fs.unlink(req.files[i].path, (error) => error ? console.error(error) : console.log("Success delete file"))
                                                    }
                                                    console.error(error)
                                                    res.status(500).json({
                                                        content: "DB Error"
                                                    })
                                                } else {
                                                    if (rows.length === 0) {
                                                        // 업로드할 파일도 없고, 기존에 파일이 없는 경우
                                                        let editTotalSql = "update cs set cs_title = " + conn.escape(req.body.cs_title) +
                                                            ", cs_contents = " + conn.escape(req.body.cs_contents) + ", cs_secret = " + conn.escape(req.body.cs_secret) + " where cs_id = " + conn.escape(req.body.cs_id)
                                                            + "; insert into cs_log(cs_id, cs_edit_date) values(" + conn.escape(req.body.cs_id) + ", " +
                                                            conn.escape(moment(new Date()).format("YYYY-MM-DD HH:mm:ss")) + ");"
                                                        conn.query(editTotalSql, function (error) {
                                                            if (error) {
                                                                for (let i = 0; i < req.files.length; i++) {
                                                                    fs.unlink(req.files[i].path, (error) => error ? console.error(error) : console.log("Success delete file"))
                                                                }
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
                                                    } else {
                                                        // 업로드할 파일이 없고, 기존에 파일이 있는 경우
                                                        for (let i = 0; i < rows.length; i++) {
                                                            fs.unlink(rows[i].cs_file_path, (error) => error ? console.error(error) : console.log("Success delete file"))
                                                        }

                                                        let editTotalSql = "delete from cs_file_dir where cs_id = " + conn.escape(req.body.cs_id) +
                                                            "; update cs set cs_title = " + conn.escape(req.body.cs_title) + ", cs_contents = " + conn.escape(req.body.cs_contents) +
                                                            ", cs_secret = " + conn.escape(req.body.cs_secret) +
                                                            " where cs_id = " + conn.escape(req.body.cs_id) +
                                                            "; insert into cs_log(cs_id, cs_edit_date) values(" + conn.escape(req.body.cs_id) + ", " + conn.escape(moment(new Date()).format("YYYY-MM-DD HH:mm:ss")) + ");"
                                                        conn.query(editTotalSql, function (error) {
                                                            if (error) {
                                                                for (let i = 0; i < req.files.length; i++) {
                                                                    fs.unlink(req.files[i].path, (error) => error ? console.error(error) : console.log("Success delete file"))
                                                                }
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
                                                    }
                                                }
                                            })
                                        } else {
                                            conn.query(fileCheckSql, fileCheckParam, function (error, rows) {
                                                if (error) {
                                                    for (let i = 0; i < req.files.length; i++) {
                                                        fs.unlink(req.files[i].path, (error) => error ? console.error(error) : console.log("Success delete file"))
                                                    }
                                                    console.error(error)
                                                    res.status(500).json({
                                                        content: "DB Error"
                                                    })
                                                } else {
                                                    // 업로드할 파일이 있고, 기존에 파일이 없는 경우
                                                    if (rows.length === 0) {
                                                        let editTotalSql = "update cs set cs_title = " + conn.escape(req.body.cs_title)
                                                            + ", cs_contents = " + conn.escape(req.body.cs_contents) + ", cs_secret = " + conn.escape(req.body.cs_secret)
                                                            + " where cs_id = " + conn.escape(req.body.cs_id) + ";"
                                                        for (let i = 0; i < req.files.length; i++) {
                                                            editTotalSql += "insert into cs_file_dir(cs_id, cs_file_name, cs_file_path) values(" + conn.escape(req.body.cs_id) +
                                                                ", " + conn.escape(req.files[i].originalname) + ", " + conn.escape(req.files[i].path) + ");"
                                                        }
                                                        editTotalSql += "insert into cs_log(cs_id, cs_edit_date) values(" + conn.escape(req.body.cs_id)
                                                            + ", " + conn.escape(moment(new Date()).format("YYYY-MM-DD HH:mm:ss")) + ");"
                                                        conn.query(editTotalSql, function (error) {
                                                            if (error) {
                                                                for (let i = 0; i < req.files.length; i++) {
                                                                    fs.unlink(req.files[i].path, (error) => error ? console.error(error) : console.log("Success delete file"))
                                                                }
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
                                                    }
                                                    // 업로드할 파일이 있고, 기존에 파일이 있는 경우
                                                    else {
                                                        for (let i = 0; i < rows.length; i++) {
                                                            fs.unlink(rows[i].cs_file_path, (error) => error ? console.error(error) : console.log("Success delete file"))
                                                        }

                                                        let editTotalSql = "delete from cs_file_dir where cs_id = " + conn.escape(req.body.cs_id) + ";"
                                                        editTotalSql += "update cs set cs_title = " + conn.escape(req.body.cs_title) + ", cs_contents = " +
                                                            conn.escape(req.body.cs_contents) + ", cs_secret = " + conn.escape(req.body.cs_secret) +
                                                            " where cs_id = " + conn.escape(req.body.cs_id) + ";"

                                                        for (let i = 0; i < req.files.length; i++) {
                                                            editTotalSql += "insert into cs_file_dir(cs_id, cs_file_name, cs_file_path) values(" + conn.escape(req.body.cs_id) +
                                                                ", " + conn.escape(req.files[i].originalname) + ", " + conn.escape(req.files[i].path) + ");"
                                                        }
                                                        editTotalSql += "insert into cs_log(cs_id, cs_edit_date) values(" + conn.escape(req.body.cs_id) +
                                                            ", " + conn.escape(moment(new Date()).format("YYYY-MM-DD HH:mm:ss")) + ");"

                                                        conn.query(editTotalSql, function (error) {
                                                            if (error) {
                                                                for (let i = 0; i < req.files.length; i++) {
                                                                    fs.unlink(req.files[i].path, (error) => error ? console.error(error) : console.log("Success delete file"))
                                                                }
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
                                                    }
                                                }
                                            })
                                        }
                                    }
                                    // 수정을 처음하지 않는 경우
                                    else {
                                        if (Object.keys(req.files).length === 0) {
                                            conn.query(fileCheckSql, fileCheckParam, function (error, rows) {
                                                if (error) {
                                                    for (let i = 0; i < req.files.length; i++) {
                                                        fs.unlink(req.files[i].path, (error) => error ? console.error(error) : console.log("Success delete file"))
                                                    }
                                                    console.error(error)
                                                    res.status(500).json({
                                                        content: "DB Error"
                                                    })
                                                } else {
                                                    if (rows.length === 0) {
                                                        // 업로드할 파일도 없고, 기존에 파일이 없는 경우
                                                        let editTotalSql = "update cs set cs_title = " + conn.escape(req.body.cs_title) +
                                                            ", cs_contents = " + conn.escape(req.body.cs_contents) +
                                                            ", cs_secret = " + conn.escape(req.body.cs_secret) +
                                                            " where cs_id = " + conn.escape(req.body.cs_id)
                                                            + "; update cs_log set cs_edit_date = " + conn.escape(moment(new Date()).format("YYYY-MM-DD HH:mm:ss"))
                                                            + " where cs_id = " + conn.escape(req.body.cs_id) + ";"
                                                        conn.query(editTotalSql, function (error) {
                                                            if (error) {
                                                                for (let i = 0; i < req.files.length; i++) {
                                                                    fs.unlink(req.files[i].path, (error) => error ? console.error(error) : console.log("Success delete file"))
                                                                }
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
                                                    } else {
                                                        // 업로드할 파일이 없고, 기존에 파일이 있는 경우
                                                        for (let i = 0; i < rows.length; i++) {
                                                            fs.unlink(rows[i].cs_file_path, (error) => error ? console.error(error) : console.log("Success delete file"))
                                                        }

                                                        let editTotalSql = "delete from cs_file_dir where cs_id = " + conn.escape(req.body.cs_id) +
                                                            "; update cs set cs_title = " + conn.escape(req.body.cs_title) + ", cs_contents = " + conn.escape(req.body.cs_contents) +
                                                            ", cs_secret = " + conn.escape(req.body.cs_secret) +
                                                            " where cs_id = " + conn.escape(req.body.cs_id) +
                                                            "; update cs_log set cs_edit_date = " + conn.escape(moment(new Date()).format("YYYY-MM-DD HH:mm:ss"))
                                                            + " where cs_id = " + conn.escape(req.body.cs_id) + ";"
                                                        conn.query(editTotalSql, function (error) {
                                                            if (error) {
                                                                for (let i = 0; i < req.files.length; i++) {
                                                                    fs.unlink(req.files[i].path, (error) => error ? console.error(error) : console.log("Success delete file"))
                                                                }
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
                                                    }
                                                }
                                            })
                                        } else {
                                            conn.query(fileCheckSql, fileCheckParam, function (error, rows) {
                                                if (error) {
                                                    for (let i = 0; i < req.files.length; i++) {
                                                        fs.unlink(req.files[i].path, (error) => error ? console.error(error) : console.log("Success delete file"))
                                                    }
                                                    console.error(error)
                                                    res.status(500).json({
                                                        content: "DB Error"
                                                    })
                                                } else {
                                                    // 업로드할 파일이 있고, 기존에 파일이 없는 경우
                                                    if (rows.length === 0) {
                                                        let editTotalSql = "update cs set cs_title = " + conn.escape(req.body.cs_title)
                                                            + ", cs_contents = " + conn.escape(req.body.cs_contents) +
                                                            ", cs_secret = " + conn.escape(req.body.cs_secret) +
                                                            " where cs_id = " + conn.escape(req.body.cs_id) + ";"
                                                        for (let i = 0; i < req.files.length; i++) {
                                                            editTotalSql += "insert into cs_file_dir(cs_id, cs_file_name, cs_file_path) values(" + conn.escape(req.body.cs_id) +
                                                                ", " + conn.escape(req.files[i].originalname) + ", " + conn.escape(req.files[i].path) + ");"
                                                        }
                                                        editTotalSql += "update cs_log set cs_edit_date = " + conn.escape(moment(new Date()).format("YYYY-MM-DD HH:mm:ss"))
                                                            + " where cs_id = " + conn.escape(req.body.cs_id) + ";"
                                                        conn.query(editTotalSql, function (error) {
                                                            if (error) {
                                                                for (let i = 0; i < req.files.length; i++) {
                                                                    fs.unlink(req.files[i].path, (error) => error ? console.error(error) : console.log("Success delete file"))
                                                                }
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
                                                    }
                                                    // 업로드할 파일이 있고, 기존에 파일이 있는 경우
                                                    else {
                                                        for (let i = 0; i < rows.length; i++) {
                                                            fs.unlink(rows[i].cs_file_path, (error) => error ? console.error(error) : console.log("Success delete file"))
                                                        }

                                                        let editTotalSql = "delete from cs_file_dir where cs_id = " + conn.escape(req.body.cs_id) + ";"
                                                        editTotalSql += "update cs set cs_title = " + conn.escape(req.body.cs_title) + ", cs_contents = " +
                                                            conn.escape(req.body.cs_contents) +
                                                            ", cs_secret = " + conn.escape(req.body.cs_secret) +
                                                            " where cs_id = " + conn.escape(req.body.cs_id) + ";"

                                                        for (let i = 0; i < req.files.length; i++) {
                                                            editTotalSql += "insert into cs_file_dir(cs_id, cs_file_name, cs_file_path) values(" + conn.escape(req.body.cs_id) +
                                                                ", " + conn.escape(req.files[i].originalname) + ", " + conn.escape(req.files[i].path) + ");"
                                                        }
                                                        editTotalSql += "update cs_log set cs_edit_date = " + conn.escape(moment(new Date()).format("YYYY-MM-DD HH:mm:ss"))
                                                            + " where cs_id = " + conn.escape(req.body.cs_id) + ";"

                                                        conn.query(editTotalSql, function (error) {
                                                            if (error) {
                                                                for (let i = 0; i < req.files.length; i++) {
                                                                    fs.unlink(req.files[i].path, (error) => error ? console.error(error) : console.log("Success delete file"))
                                                                }
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
                                                    }
                                                }
                                            })
                                        }
                                    }
                                }
                            })
                        } else {
                            for (let i = 0; i < req.files.length; i++) {
                                fs.unlink(req.files[i].path, (error) => error ? console.error(error) : console.log("Success delete file"))
                            }
                            res.status(401).json({
                                content: false
                            })
                        }
                    }
                }
                conn.release()
            })
        })
    }
})

// 7. 문의글 검색(사용자)
app.get("/search-title", (req, res) => {
    if (req.query.cs_title === undefined) {
        res.status(401).json({
            content: false
        })
    } else {
        getConnection((conn) => {
            let getCountSql = "select count(*) as count from cs join member on cs.member_email = member.member_email\n" +
                "where match(cs_title) against(? in boolean mode) and cs_delete != ? and member_secede != ?\n" +
                "and member_ban != ?"
            let getCountParam = [req.query.cs_title, 1, 1, 1]
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
                                    let searchCsSql = "select cs_title, member_name, cs_date, admin.admin_name, cs.cs_resp_date, cs_secret\n" +
                                        "from cs\n" +
                                        "         left join member on cs.member_email = member.member_email\n" +
                                        "         left join admin on cs.admin_email = admin.admin_email\n" +
                                        "where match(cs_title) against(? in boolean mode)\n" +
                                        "  and cs_delete != ?\n" +
                                        "  and member.member_secede != ?\n" +
                                        "  and member.member_ban != ?\n" +
                                        "order by cs_id desc\n" +
                                        "limit ?, ?;"
                                    let searchCsParam = [req.query.cs_title, 1, 1, 1, start, pageSize]
                                    conn.query(searchCsSql, searchCsParam, function (error, rows) {
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
                                                let csStruct = []
                                                for (let i = 0; i < rows.length; i++) {
                                                    if (rows[i].cs_resp_date === null) {
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
                                                    } else {
                                                        if (rows[i].cs_secret === 1) {
                                                            csStruct.push({
                                                                cs_title: "[비밀글] " + rows[i].cs_title,
                                                                member_name: rows[i].member_name,
                                                                cs_date: rows[i].cs_date,
                                                                cs_resp_title: "[비밀글] RE : " + rows[i].cs_title,
                                                                admin_name: rows[i].admin_name,
                                                                cs_resp_date: rows[i].cs_resp_date
                                                            })
                                                        } else {
                                                            csStruct.push({
                                                                cs_title: rows[i].cs_title,
                                                                member_name: rows[i].member_name,
                                                                cs_date: rows[i].cs_date,
                                                                cs_resp_title: "RE : " + rows[i].cs_title,
                                                                admin_name: rows[i].admin_name,
                                                                cs_resp_date: rows[i].cs_resp_date
                                                            })
                                                        }
                                                    }
                                                }
                                                res.status(200).json({
                                                    csStruct
                                                })
                                            }
                                        }
                                    })
                                }
                            }
                        } else {
                            let searchCsSql = "select cs_title, member_name, cs_date, admin.admin_name, cs.cs_resp_date, cs_secret\n" +
                                "from cs\n" +
                                "         left join member on cs.member_email = member.member_email\n" +
                                "         left join admin on cs.admin_email = admin.admin_email\n" +
                                "where match(cs_title) against(? in boolean mode)\n" +
                                "  and cs_delete != ?\n" +
                                "  and member.member_secede != ?\n" +
                                "  and member.member_ban != ?\n" +
                                "order by cs_id desc\n" +
                                "limit ?, ?;"
                            let searchCsParam = [req.query.cs_title, 1, 1, 1, 0, rows[0].count]
                            conn.query(searchCsSql, searchCsParam, function (error, rows) {
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
                                        let csStruct = []
                                        for (let i = 0; i < rows.length; i++) {
                                            if (rows[i].cs_resp_date === null) {
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
                                            } else {
                                                if (rows[i].cs_secret === 1) {
                                                    csStruct.push({
                                                        cs_title: "[비밀글] " + rows[i].cs_title,
                                                        member_name: rows[i].member_name,
                                                        cs_date: rows[i].cs_date,
                                                        cs_resp_title: "[비밀글] RE : " + rows[i].cs_title,
                                                        admin_name: rows[i].admin_name,
                                                        cs_resp_date: rows[i].cs_resp_date
                                                    })
                                                } else {
                                                    csStruct.push({
                                                        cs_title: rows[i].cs_title,
                                                        member_name: rows[i].member_name,
                                                        cs_date: rows[i].cs_date,
                                                        cs_resp_title: "RE : " + rows[i].cs_title,
                                                        admin_name: rows[i].admin_name,
                                                        cs_resp_date: rows[i].cs_resp_date
                                                    })
                                                }
                                            }
                                        }
                                        res.status(200).json({
                                            csStruct
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

module.exports = app;