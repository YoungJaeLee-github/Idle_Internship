/**
 * --------------------------------------------------------------------------------------------------------
 * 모듈/필드 변수 부분
 * --------------------------------------------------------------------------------------------------------
 */
const express = require("express")
const app = express.Router()
const getConnection = require("../config/database_config.js").getConnection
const fs = require("fs")
const path = require("path")
const logger = require("../config/winston_config.js").logger
const sessionConfig = require("../config/session_config.js")
app.use(sessionConfig.init())

/**
 * --------------------------------------------------------------------------------------------------------
 * API 구현 부분
 * --------------------------------------------------------------------------------------------------------
 */

/**
 * 공지사항 API
 */
// 1. 공지사항 조회(사용자)
app.get("/list", (req, res) => {
    getConnection((conn) => {
        let getCountSql = "select count(*) as count from notice where notice_delete != ?;"
        let getCountParam = [1]
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
                                let searchNoticeSql = "select notice_title, notice_date from notice where notice_delete != ? order by notice_id desc limit ?, ?;"
                                let searchNoticeParam = [1, start, pageSize]
                                conn.query(searchNoticeSql, searchNoticeParam, function (error, rows) {
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
                                            let noticeStruct = []
                                            for (let i = 0; i < rows.length; i++) {
                                                noticeStruct.push({
                                                    notice_id: "공지",
                                                    notice_title: rows[i].notice_title,
                                                    notice_date: rows[i].notice_date
                                                })
                                            }
                                            res.status(200).json({
                                                noticeStruct
                                            })
                                        }
                                    }
                                })
                            }
                        }
                    } else {
                        let searchNoticeSql = "select notice_title, notice_date from notice where notice_delete != ? order by notice_id desc limit ?, ?;"
                        let searchNoticeParam = [1, 0, rows[0].count]
                        conn.query(searchNoticeSql, searchNoticeParam, function (error, rows) {
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
                                    let noticeStruct = []
                                    for (let i = 0; i < rows.length; i++) {
                                        noticeStruct.push({
                                            notice_id: "공지",
                                            notice_title: rows[i].notice_title,
                                            notice_date: rows[i].notice_date
                                        })
                                    }
                                    res.status(200).json({
                                        noticeStruct
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

// 2. 공지사항 상세 조회(사용자)
app.get("/detail", (req, res) => {
    if (req.query.notice_id === undefined)
        res.status(401).json({
            content: false
        })
    else {
        getConnection((conn) => {
            let searchDetailSql = "select notice_title, admin.admin_name, notice_date, notice_contents, notice_file_dir.notice_file_name from notice left join admin on admin.admin_email = notice.admin_email left join notice_file_dir on notice.notice_id = notice_file_dir.notice_id where notice_delete != ? and notice.notice_id = ?;"
            let searchDetailParam = [1, req.query.notice_id]
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
                        let noticeDetailStruct = []
                        if (rows[0].notice_file_name === null) {
                            noticeDetailStruct.push({
                                notice_title: rows[0].notice_title,
                                admin_name: rows[0].admin_name,
                                notice_date: rows[0].notice_date,
                                notice_contents: rows[0].notice_contents,
                            })
                        } else {
                            for (let i = 0; i < rows.length; i++) {
                                noticeDetailStruct.push({
                                    notice_title: rows[i].notice_title,
                                    admin_name: rows[i].admin_name,
                                    notice_date: rows[i].notice_date,
                                    notice_contents: rows[i].notice_contents,
                                    file_name: rows[i].notice_file_name
                                })
                            }
                        }
                        res.status(200).json({
                            noticeDetailStruct
                        })
                    }
                }
                conn.release()
            })
        })
    }
})

// 3. 공지사항 첨부파일 다운로드(사용자)
app.post("/download", (req, res) => {
    if (req.body.notice_id === undefined || req.body.notice_file_name === undefined)
        res.status(401).json({
            content: false
        })
    else {
        getConnection((conn) => {
            let searchNoticeFileSql = "select notice_file_path from notice_file_dir join notice on notice_file_dir.notice_id = notice.notice_id where notice_delete != ? and notice_file_name = ? and notice_file_dir.notice_id = ?;"
            let searchNoticeFileParam = [1, req.body.notice_file_name, req.body.notice_id]
            conn.query(searchNoticeFileSql, searchNoticeFileParam, function (error, rows) {
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
                        let file = rows[0].notice_file_path
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
                conn.release()
            })
        })
    }
})

// 4. 공지사항 검색(사용자)
app.get("/search-title", (req, res) => {
    if (req.query.notice_title === undefined) {
        res.status(401).json({
            content: false
        })
    } else {
        getConnection((conn) => {
            let getCountSql = "select count(*) as count from notice" +
                " where match(notice_title) against(? in boolean mode) and notice_delete != ?;"
            let getCountParam = [req.query.notice_title, 1]
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
                                    let searchNoticeSql = "select notice_title, notice_date\n" +
                                        "from notice\n" +
                                        "where match(notice_title) against(? in boolean mode)\n" +
                                        "  and notice_delete != ?\n" +
                                        "order by notice_id desc\n" +
                                        "limit ?, ?;"
                                    let searchNoticeParam = [req.query.notice_title, 1, start, pageSize]
                                    conn.query(searchNoticeSql, searchNoticeParam, function (error, rows) {
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
                                                let noticeStruct = []
                                                for (let i = 0; i < rows.length; i++) {
                                                    noticeStruct.push({
                                                        notice_id: "공지",
                                                        notice_title: rows[i].notice_title,
                                                        notice_date: rows[i].notice_date
                                                    })
                                                }
                                                res.status(200).json({
                                                    noticeStruct
                                                })
                                            }
                                        }
                                    })
                                }
                            }
                        } else {
                            let searchNoticeSql = "select notice_title, notice_date\n" +
                                "from notice\n" +
                                "where match(notice_title) against(? in boolean mode)\n" +
                                "  and notice_delete != ?\n" +
                                "order by notice_id desc\n" +
                                "limit ?, ?;"
                            let searchNoticeParam = [req.query.notice_title, 1, 0, rows[0].count]
                            conn.query(searchNoticeSql, searchNoticeParam, function (error, rows) {
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
                                        let noticeStruct = []
                                        for (let i = 0; i < rows.length; i++) {
                                            noticeStruct.push({
                                                notice_id: "공지",
                                                notice_title: rows[i].notice_title,
                                                notice_date: rows[i].notice_date
                                            })
                                        }
                                        res.status(200).json({
                                            noticeStruct
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

module.exports = app