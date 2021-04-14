/**
 * --------------------------------------------------------------------------------------------------------
 * 모듈/필드 변수 부분
 * --------------------------------------------------------------------------------------------------------
 */
const express = require("express")
const app = express.Router()
const getConnection = require("../config/database_config.js").getConnection
const upload = require("../config/multer_config.js").upload
const fs = require("fs")
const path = require("path")
const func = require("../common/function.js")
const sessionConfig = require("../config/session_config.js")
app.use(sessionConfig.init())

/**
 * --------------------------------------------------------------------------------------------------------
 * API 구현 부분
 * --------------------------------------------------------------------------------------------------------
 */

/**
 * 아이디어 API
 */
// 1. 아이디어 작성
app.post("/regist", upload.any(), (req, res) => {
    if (req.session.member_email === undefined || req.body.idea_contents === undefined || req.body.idea_title === undefined) {
        for (let i = 0; i < req.files.length; i++) {
            fs.unlink(req.files[i].path, (error) => error ? console.error(error) : console.log("Success delete file"))
        }
        res.status(401).json({
            content: false
        })
    } else {
        getConnection((conn) => {
            let checkMemberSql = "select member_ban, member_secede, save_point, use_point from member where member_email = ?"
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
                            let savePoint = rows[0].save_point
                            let usePoint = rows[0].use_point
                            let todoAddSavePoint = savePoint + 500
                            let todoAddMemberPoint = todoAddSavePoint - usePoint
                            let totalSql = "insert into idea(idea_title, idea_contents, idea_date, member_email, add_point, idea_delete)" +
                                "values( " + conn.escape(req.body.idea_title) + ", " + conn.escape(req.body.idea_contents) + ", " + conn.escape(new Date()) + ", " +
                                conn.escape(req.session.member_email) + ", " + conn.escape(500) + ", " + conn.escape(0) + ");"
                            totalSql += "update member set member_point = " + conn.escape(todoAddMemberPoint) + ", save_point = " + conn.escape(todoAddSavePoint) +
                                " where member_email = " + conn.escape(req.session.member_email) + ";"
                            conn.query(totalSql, function (error) {
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
                                        console.log("insert idea success.")
                                        res.status(200).json({
                                            content: true
                                        })
                                    } else {
                                        let insertFileSql = ""
                                        for (let i = 0; i < req.files.length; i++) {
                                            insertFileSql += "insert into idea_file_dir(idea_file_name, idea_file_path, idea_id) values(" + conn.escape(req.files[i].originalname) +
                                                ", " + conn.escape(req.files[i].path) + ", " + "(select idea_id from idea where member_email = " + conn.escape(req.session.member_email) +
                                                " order by idea_id desc limit " + conn.escape(1) + "));"
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
                                                console.log("insert idea & file success.")
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

// 2. 아이디어 수정
app.patch("/edit", upload.any(), (req, res) => {
    if (req.session.member_email === undefined || req.body.idea_contents === undefined || req.body.idea_title === undefined || req.body.idea_id === undefined) {
        for (let i = 0; i < req.files.length; i++) {
            fs.unlink(req.files[i].path, (error) => error ? console.error(error) : console.log("Success delete file"))
        }
        res.status(401).json({
            content: false
        })
    } else {
        getConnection((conn) => {
            let memberCheckSql = "select idea.member_email from idea join member on idea.member_email = member.member_email where member_ban != ? and member_secede != ? and idea_delete != ? and idea_id = ?;"
            let memberCheckParam = [1, 1, 1, req.body.idea_id]
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
                            let checkLogSql = "select idea_id from idea_log where idea_id = ?;"
                            let checkLogParam = [req.body.idea_id]
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
                                    let fileCheckSql = "select idea_id, idea_file_path from idea_file_dir where idea_id = ?;"
                                    let fileCheckParam = [req.body.idea_id]
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
                                                        let editTotalSql = "update idea set idea_title = " + conn.escape(req.body.idea_title) +
                                                            ", idea_contents = " + conn.escape(req.body.idea_contents) + " where idea_id = " + conn.escape(req.body.idea_id)
                                                            + "; insert into idea_log(idea_id, idea_edit_date) values(" + conn.escape(req.body.idea_id) + ", " +
                                                            conn.escape(new Date()) + ");"
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
                                                            fs.unlink(rows[i].idea_file_path, (error) => error ? console.error(error) : console.log("Success delete file"))
                                                        }

                                                        let editTotalSql = "delete from idea_file_dir where idea_id = " + conn.escape(req.body.idea_id) +
                                                            "; update idea set idea_title = " + conn.escape(req.body.idea_title) + ", idea_contents = " + conn.escape(req.body.idea_contents) +
                                                            " where idea_id = " + conn.escape(req.body.idea_id) +
                                                            "; insert into idea_log(idea_id, idea_edit_date) values(" + conn.escape(req.body.idea_id) + ", " + conn.escape(new Date()) + ");"
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
                                                        let editTotalSql = "update idea set idea_title = " + conn.escape(req.body.idea_title)
                                                            + ", idea_contents = " + conn.escape(req.body.idea_contents)
                                                            + " where idea_id = " + conn.escape(req.body.idea_id) + ";"
                                                        for (let i = 0; i < req.files.length; i++) {
                                                            editTotalSql += "insert into idea_file_dir(idea_id, idea_file_name, idea_file_path) values(" + conn.escape(req.body.idea_id) +
                                                                ", " + conn.escape(req.files[i].originalname) + ", " + conn.escape(req.files[i].path) + ");"
                                                        }
                                                        editTotalSql += "insert into idea_log(idea_id, idea_edit_date) values(" + conn.escape(req.body.idea_id)
                                                            + ", " + conn.escape(new Date()) + ");"
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
                                                            fs.unlink(rows[i].idea_file_path, (error) => error ? console.error(error) : console.log("Success delete file"))
                                                        }

                                                        let editTotalSql = "delete from idea_file_dir where idea_id = " + conn.escape(req.body.idea_id) + ";"
                                                        editTotalSql += "update idea set idea_title = " + conn.escape(req.body.idea_title) + ", idea_contents = " +
                                                            conn.escape(req.body.idea_contents) + " where idea_id = " + conn.escape(req.body.idea_id) + ";"
                                                        for (let i = 0; i < req.files.length; i++) {
                                                            editTotalSql += "insert into idea_file_dir(idea_id, idea_file_name, idea_file_path) values(" + conn.escape(req.body.idea_id) +
                                                                ", " + conn.escape(req.files[i].originalname) + ", " + conn.escape(req.files[i].path) + ");"
                                                        }
                                                        editTotalSql += "insert into idea_log(idea_id, idea_edit_date) values(" + conn.escape(req.body.idea_id) +
                                                            ", " + conn.escape(new Date()) + ");"

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
                                                        let editTotalSql = "update idea set idea_title = " + conn.escape(req.body.idea_title) +
                                                            ", idea_contents = " + conn.escape(req.body.idea_contents) +
                                                            " where idea_id = " + conn.escape(req.body.idea_id)
                                                            + "; update idea_log set idea_edit_date = " + conn.escape(new Date())
                                                            + " where idea_id = " + conn.escape(req.body.idea_id) + ";"
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
                                                            fs.unlink(rows[i].idea_file_path, (error) => error ? console.error(error) : console.log("Success delete file"))
                                                        }

                                                        let editTotalSql = "delete from idea_file_dir where idea_id = " + conn.escape(req.body.idea_id) +
                                                            "; update idea set idea_title = " + conn.escape(req.body.idea_title) + ", idea_contents = " + conn.escape(req.body.idea_contents) +
                                                            " where idea_id = " + conn.escape(req.body.idea_id) +
                                                            "; update idea_log set idea_edit_date = " + conn.escape(new Date())
                                                            + " where idea_id = " + conn.escape(req.body.idea_id) + ";"
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
                                                        let editTotalSql = "update idea set idea_title = " + conn.escape(req.body.idea_title)
                                                            + ", idea_contents = " + conn.escape(req.body.idea_contents) +
                                                            " where idea_id = " + conn.escape(req.body.idea_id) + ";"
                                                        for (let i = 0; i < req.files.length; i++) {
                                                            editTotalSql += "insert into idea_file_dir(idea_id, idea_file_name, idea_file_path) values(" + conn.escape(req.body.idea_id) +
                                                                ", " + conn.escape(req.files[i].originalname) + ", " + conn.escape(req.files[i].path) + ");"
                                                        }
                                                        editTotalSql += "update idea_log set idea_edit_date = " + conn.escape(new Date())
                                                            + " where idea_id = " + conn.escape(req.body.idea_id) + ";"
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
                                                            fs.unlink(rows[i].idea_file_path, (error) => error ? console.error(error) : console.log("Success delete file"))
                                                        }

                                                        let editTotalSql = "delete from idea_file_dir where idea_id = " + conn.escape(req.body.idea_id) + ";"
                                                        editTotalSql += "update idea set idea_title = " + conn.escape(req.body.idea_title) + ", idea_contents = " +
                                                            conn.escape(req.body.idea_contents) +
                                                            " where idea_id = " + conn.escape(req.body.idea_id) + ";"

                                                        for (let i = 0; i < req.files.length; i++) {
                                                            editTotalSql += "insert into idea_file_dir(idea_id, idea_file_name, idea_file_path) values(" + conn.escape(req.body.idea_id) +
                                                                ", " + conn.escape(req.files[i].originalname) + ", " + conn.escape(req.files[i].path) + ");"
                                                        }
                                                        editTotalSql += "update idea_log set idea_edit_date = " + conn.escape(new Date())
                                                            + " where idea_id = " + conn.escape(req.body.idea_id) + ";"

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

// 3. 아이디어 조회(사용자)
app.get("/list", (req, res) => {
    getConnection((conn) => {
        let getCountSql = "select count(*) as count from idea join member on idea.member_email = member.member_email where member_secede != ? and member_ban != ? and idea_delete != ?;"
        let getCountParam = [1, 1, 1]
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
                                let searchSql = "select idea_title, idea_date, idea.member_email\n" +
                                    "from idea\n" +
                                    "         join member m on idea.member_email = m.member_email\n" +
                                    "where idea_delete != ?\n" +
                                    "  and member_ban != ?\n" +
                                    "  and member_secede != ?\n" +
                                    "order by idea_date desc\n" +
                                    "limit ?, ?;"
                                let searchParam = [1, 1, 1, start, pageSize]
                                conn.query(searchSql, searchParam, function (error, rows) {
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
                                            let ideaStruct = []
                                            for (let i = 0; i < rows.length; i++) {
                                                if (rows[i].member_email === req.session.member_email) {
                                                    ideaStruct.push({
                                                        idea_title: rows[i].idea_title,
                                                        idea_date: rows[i].idea_date
                                                    })
                                                } else {
                                                    ideaStruct.push({
                                                        idea_title: func.masking(rows[i].idea_title),
                                                        idea_date: rows[i].idea_date
                                                    })
                                                }
                                            }
                                            let searchRankSql = "select member_rank, member_name, save_point from member where member_ban != ? and member_secede != ? and member_rank is not null order by member_rank asc limit ?;"
                                            let searchRankParam = [1, 1, 10]
                                            conn.query(searchRankSql, searchRankParam, function (error, rows) {
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
                                                        let rankStruct = []
                                                        for (let i = 0; i < rows.length; i++) {
                                                            rankStruct.push({
                                                                member_rank: rows[i].member_rank,
                                                                member_name: rows[i].member_name,
                                                                save_point: rows[i].save_point
                                                            })
                                                        }
                                                        res.status(200).json({
                                                            ideaStruct,
                                                            rankStruct
                                                        })
                                                    }
                                                }
                                            })
                                        }
                                    }
                                })
                            }
                        }
                    } else {
                        let searchSql = "select idea_title, idea_date, idea.member_email\n" +
                            "from idea\n" +
                            "         join member m on idea.member_email = m.member_email\n" +
                            "where idea_delete != ?\n" +
                            "  and member_ban != ?\n" +
                            "  and member_secede != ?\n" +
                            "order by idea_date desc\n" +
                            "limit ?, ?;"
                        let searchParam = [1, 1, 1, 0, rows[0].count]
                        conn.query(searchSql, searchParam, function (error, rows) {
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
                                    let ideaStruct = []
                                    for (let i = 0; i < rows.length; i++) {
                                        if (rows[i].member_email === req.session.member_email) {
                                            ideaStruct.push({
                                                idea_title: rows[i].idea_title,
                                                idea_date: rows[i].idea_date
                                            })
                                        } else {
                                            ideaStruct.push({
                                                idea_title: func.masking(rows[i].idea_title),
                                                idea_date: rows[i].idea_date
                                            })
                                        }
                                    }
                                    let searchRankSql = "select member_rank, member_name, save_point from member where member_ban != ? and member_secede != ? and member_rank is not null order by member_rank asc limit ?;"
                                    let searchRankParam = [1, 1, 10]
                                    conn.query(searchRankSql, searchRankParam, function (error, rows) {
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
                                                let rankStruct = []
                                                for (let i = 0; i < rows.length; i++) {
                                                    rankStruct.push({
                                                        member_rank: rows[i].member_rank,
                                                        member_name: rows[i].member_name,
                                                        save_point: rows[i].save_point
                                                    })
                                                }
                                                res.status(200).json({
                                                    ideaStruct,
                                                    rankStruct
                                                })
                                            }
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
})

// 4. 아이디어 상세 조회(사용자)
app.get("/detail", (req, res) => {
    if (req.query.idea_id === undefined) {
        res.status(401).json({
            content: false
        })
    } else {
        getConnection((conn) => {
            let searchDetailSql = "select idea_title, idea.member_email, member.member_name, idea_date, idea_contents, idea_file_dir.idea_file_name from idea left join member on idea.member_email = member.member_email left join idea_file_dir on idea.idea_id = idea_file_dir.idea_id where idea_delete != ? and member.member_ban != ? and member.member_secede != ? and idea.idea_id = ?;"
            let searchDetailParam = [1, 1, 1, req.query.idea_id]
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
                        let ideaDetailStruct = []
                        if (req.session.member_email === rows[0].member_email) {
                            if (rows[0].idea_file_name === null) {
                                ideaDetailStruct.push({
                                    idea_title: rows[0].idea_title,
                                    member_name: rows[0].member_name,
                                    idea_date: rows[0].idea_date,
                                    idea_contents: rows[0].idea_contents
                                })
                            } else {
                                for (let i = 0; i < rows.length; i++) {
                                    ideaDetailStruct.push({
                                        idea_title: rows[i].idea_title,
                                        member_name: rows[i].member_name,
                                        idea_date: rows[i].idea_date,
                                        idea_contents: rows[i].idea_contents,
                                        idea_file_name: rows[i].idea_file_name
                                    })
                                }
                            }
                            res.status(200).json({
                                ideaDetailStruct
                            })
                        } else {
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

// 5. 아이디어 첨부파일 다운로드(사용자)
app.post("/download", (req, res) => {
    if (req.body.idea_id === undefined || req.body.idea_file_name === undefined)
        res.status(401).json({
            content: false
        })
    else {
        getConnection((conn) => {
            let searchIdeaFileSql = "select idea_file_path, idea.member_email from idea_file_dir join idea on idea_file_dir.idea_id = idea.idea_id join member on idea.member_email = member.member_email where idea_delete != ? and member_secede != ? and member_ban != ? and idea_file_name = ? and idea_file_dir.idea_id = ?;"
            let searchIdeaFileParam = [1, 1, 1, req.body.idea_file_name, req.body.idea_id]
            conn.query(searchIdeaFileSql, searchIdeaFileParam, function (error, rows) {
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
                        if (rows[0].member_email === req.session.member_email) {
                            let file = rows[0].idea_file_path
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
                    }
                }
                conn.release()
            })
        })
    }
})

// 6. 아이디어 검색(사용자)
app.get("/search-title", (req, res) => {
    if (req.query.idea_title === undefined) {
        res.status(401).json({
            content: false
        })
    } else {
        getConnection((conn) => {
            let getCountSql = "select count(*) as count from idea join member on idea.member_email = member.member_email\n" +
                "where match(idea_title) against(? in boolean mode) and idea_delete != ? and member_secede != ?\n" +
                "and member_ban != ?"
            let getCountParam = [req.query.idea_title, 1, 1, 1]
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
                                    let searchIdeaSql = "select idea_title, idea_date, idea.member_email\n" +
                                        "from idea\n" +
                                        "         left join member on idea.member_email = member.member_email\n" +
                                        "         left join admin on idea.admin_email = admin.admin_email\n" +
                                        "where match(idea_title) against(? in boolean mode)\n" +
                                        "  and idea_delete != ?\n" +
                                        "  and member.member_secede != ?\n" +
                                        "  and member.member_ban != ?\n" +
                                        "order by idea_id desc\n" +
                                        "limit ?, ?;"
                                    let searchIdeaParam = [req.query.idea_title, 1, 1, 1, start, pageSize]
                                    conn.query(searchIdeaSql, searchIdeaParam, function (error, rows) {
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
                                                let ideaStruct = []
                                                for (let i = 0; i < rows.length; i++) {
                                                    if (rows[i].member_email === req.session.member_email) {
                                                        ideaStruct.push({
                                                            idea_title: rows[i].idea_title,
                                                            idea_date: rows[i].idea_date
                                                        })
                                                    } else {
                                                        ideaStruct.push({
                                                            idea_title: func.masking(rows[i].idea_title),
                                                            idea_date: rows[i].idea_date
                                                        })
                                                    }
                                                }
                                                let searchRankSql = "select member_rank, member_name, save_point from member where member_ban != ? and member_secede != ? and member_rank is not null order by member_rank asc limit ?;"
                                                let searchRankParam = [1, 1, 10]
                                                conn.query(searchRankSql, searchRankParam, function (error, rows) {
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
                                                            let rankStruct = []
                                                            for (let i = 0; i < rows.length; i++) {
                                                                rankStruct.push({
                                                                    member_rank: rows[i].member_rank,
                                                                    member_name: rows[i].member_name,
                                                                    save_point: rows[i].save_point
                                                                })
                                                            }
                                                            res.status(200).json({
                                                                ideaStruct,
                                                                rankStruct
                                                            })
                                                        }
                                                    }
                                                })
                                            }
                                        }
                                    })
                                }
                            }
                        } else {
                            let searchIdeaSql = "select idea_title, idea_date, idea.member_email\n" +
                                "from idea\n" +
                                "         left join member on idea.member_email = member.member_email\n" +
                                "         left join admin on idea.admin_email = admin.admin_email\n" +
                                "where match(idea_title) against(? in boolean mode)\n" +
                                "  and idea_delete != ?\n" +
                                "  and member.member_secede != ?\n" +
                                "  and member.member_ban != ?\n" +
                                "order by idea_id desc\n" +
                                "limit ?, ?;"
                            let searchIdeaParam = [req.query.idea_title, 1, 1, 1, 0, rows[0].count]
                            conn.query(searchIdeaSql, searchIdeaParam, function (error, rows) {
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
                                        let ideaStruct = []
                                        for (let i = 0; i < rows.length; i++) {
                                            if (rows[i].member_email === req.session.member_email) {
                                                ideaStruct.push({
                                                    idea_title: rows[i].idea_title,
                                                    idea_date: rows[i].idea_date
                                                })
                                            } else {
                                                ideaStruct.push({
                                                    idea_title: func.masking(rows[i].idea_title),
                                                    idea_date: rows[i].idea_date
                                                })
                                            }
                                        }
                                        let searchRankSql = "select member_rank, member_name, save_point from member where member_ban != ? and member_secede != ? and member_rank is not null order by member_rank asc limit ?;"
                                        let searchRankParam = [1, 1, 10]
                                        conn.query(searchRankSql, searchRankParam, function (error, rows) {
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
                                                    let rankStruct = []
                                                    for (let i = 0; i < rows.length; i++) {
                                                        rankStruct.push({
                                                            member_rank: rows[i].member_rank,
                                                            member_name: rows[i].member_name,
                                                            save_point: rows[i].save_point
                                                        })
                                                    }
                                                    res.status(200).json({
                                                        ideaStruct,
                                                        rankStruct
                                                    })
                                                }
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

module.exports = app;