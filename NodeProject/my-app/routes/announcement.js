/**
 * --------------------------------------------------------------------------------------------------------
 * 모듈/필드 변수 부분
 * --------------------------------------------------------------------------------------------------------
 */
const express = require("express")
const app = express.Router()
const getConnection = require("../config/database_config.js").getConnection
const logger = require("../config/winston_config.js").logger
const sessionConfig = require("../config/session_config.js")
app.use(sessionConfig.init())

/**
 * --------------------------------------------------------------------------------------------------------
 * API 구현 부분
 * --------------------------------------------------------------------------------------------------------
 */

/**
 * 공고정보게시판 API
 */
// 1. 공고정보 조회(사용자)
app.get("/list", (req, res) => {
    getConnection((conn) => {
        let getCountSql = "select count(*) as count from anno;"
        conn.query(getCountSql, function (error, rows) {
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
                                let searchSql = "select anno_title, anno_date\n" +
                                    "from anno\n" +
                                    "order by anno_date desc\n" +
                                    "limit ?, ?"
                                let searchParam = [start, pageSize]
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
                                            let annoStruct = []
                                            for (let i = 0; i < rows.length; i++) {
                                                annoStruct.push({
                                                    anno_title: rows[i].anno_title,
                                                    anno_date: rows[i].anno_date
                                                })
                                            }

                                            res.status(200).json({
                                                annoStruct
                                            })
                                        }
                                    }
                                })
                            }
                        }
                    } else {
                        let searchSql = "select anno_title, anno_date\n" +
                            "from anno\n" +
                            "order by anno_date desc\n" +
                            "limit ?, ?"
                        let searchParam = [0, rows[0].count]
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
                                    let annoStruct = []
                                    for (let i = 0; i < rows.length; i++) {
                                        annoStruct.push({
                                            anno_title: rows[i].anno_title,
                                            anno_date: rows[i].anno_date
                                        })
                                    }

                                    res.status(200).json({
                                        annoStruct
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

// 2. 공고정보 상세 조회(사용자)
app.get("/detail", (req, res) => {
    if (req.query.anno_id === undefined)
        res.status(401).json({
            content: false
        })
    else {
        getConnection((conn) => {
            let searchDetailSql = "select anno_ref, anno_link, anno_contents from anno where anno.anno_id = ?;"
            let searchDetailParam = [req.query.anno_id]
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
                        let annoStruct = []
                        // 로그인 하지 않은 경우.
                        if (req.session.member_email === undefined) {
                            annoStruct.push({
                                anno_ref: rows[0].anno_ref,
                                anno_link: rows[0].anno_link,
                                anno_contents: rows[0].anno_contents,
                                marked_flag: 0
                            })
                            res.status(200).json({
                                annoStruct
                            })
                        } else {
                            // 로그인 한 경우.
                            let annoRef = rows[0].anno_ref
                            let annoLink = rows[0].anno_link
                            let annoContents = rows[0].anno_contents

                            let memberCheckSql = "select member_ban, member_secede from member where member_email = ?"
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
                                            let searchInterSql = "select inter_anno.member_email from inter_anno left join member on inter_anno.member_email = member.member_email where member.member_email = ? and anno_id = ?;"
                                            let searchInterParam = [req.session.member_email, req.query.anno_id]
                                            conn.query(searchInterSql, searchInterParam, function (error, rows) {
                                                if (error) {
                                                    console.error(error)
                                                    res.status(500).json({
                                                        content: "DB Error"
                                                    })
                                                } else {
                                                    if (rows.length === 0) {
                                                        annoStruct.push({
                                                            anno_ref: annoRef,
                                                            anno_link: annoLink,
                                                            anno_contents: annoContents,
                                                            marked_flag: 0
                                                        })
                                                        res.status(200).json({
                                                            annoStruct
                                                        })
                                                    } else {
                                                        if (req.session.member_email === rows[0].member_email) {
                                                            annoStruct.push({
                                                                anno_ref: annoRef,
                                                                anno_link: annoLink,
                                                                anno_contents: annoContents,
                                                                marked_flag: 1
                                                            })
                                                            res.status(200).json({
                                                                annoStruct
                                                            })
                                                        } else {
                                                            res.status(401).json({
                                                                content: false
                                                            })
                                                        }
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

// 3. 공고정보 검색(사용자)
app.get("/search-title", (req, res) => {
    if (req.query.anno_title === undefined) {
        res.status(401).json({
            content: false
        })
    } else {
        getConnection((conn) => {
            let getCountSql = "select count(*) as count from anno" +
                " where match(anno_title) against(? in boolean mode);"
            let getCountParam = [req.query.anno_title]
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
                                    let searchAnnoSql = "select anno_title, anno_date\n" +
                                        "from anno\n" +
                                        "where match(anno_title) against(? in boolean mode)\n" +
                                        "order by anno_date desc\n" +
                                        "limit ?, ?;"
                                    let searchAnnoParam = [req.query.anno_title, start, pageSize]
                                    conn.query(searchAnnoSql, searchAnnoParam, function (error, rows) {
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
                                                let annoStruct = []
                                                for (let i = 0; i < rows.length; i++) {
                                                    annoStruct.push({
                                                        anno_title: rows[i].anno_title,
                                                        anno_date: rows[i].anno_date
                                                    })
                                                }
                                                res.status(200).json({
                                                    annoStruct
                                                })
                                            }
                                        }
                                    })
                                }
                            }
                        } else {
                            let searchAnnoSql = "select anno_title, anno_date\n" +
                                "from anno\n" +
                                "where match(anno_title) against(? in boolean mode)\n" +
                                "order by anno_date desc\n" +
                                "limit ?, ?;"
                            let searchAnnoParam = [req.query.anno_title, 0, rows[0].count]
                            conn.query(searchAnnoSql, searchAnnoParam, function (error, rows) {
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
                                        let annoStruct = []
                                        for (let i = 0; i < rows.length; i++) {
                                            annoStruct.push({
                                                anno_title: rows[i].anno_title,
                                                anno_date: rows[i].anno_date
                                            })
                                        }
                                        res.status(200).json({
                                            annoStruct
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

// 4. 출처링크 바로가기
app.get("/link", (req, res) => {
    if (req.query.anno_link === undefined) {
        res.status(404).json({
            content: false
        })
    } else {
        getConnection((conn) => {
            let searchAnnoLinkSql = "select anno_flag from anno where anno_link = ?;"
            let searchAnnoLinkParam = [req.query.anno_link]
            conn.query(searchAnnoLinkSql, searchAnnoLinkParam, function (error, rows) {
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
                        res.status(200).json({
                            content: true
                        })
                    }
                }
                conn.release()
            })
        })
    }
})

// 5. 즐겨찾기 등록/삭제
app.patch("/mark", (req, res) => {
    if (req.session.member_email === undefined || req.body.anno_id === undefined || req.body.marked_flag === undefined) {
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
                    if (rows.length === 0) {
                        res.status(401).json({
                            content: false
                        })
                    } else {
                        if (rows[0].member_ban === 1 || rows[0].member_secede === 1) {
                            res.status(401).json({
                                content: false
                            })
                        } else {
                            let annoCheckSql = "select anno_id from anno where anno_id = ?;"
                            let annoCheckParam = [req.body.anno_id]
                            conn.query(annoCheckSql, annoCheckParam, function (error, rows) {
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
                                        let markCheckSql = "select anno_id from inter_anno where member_email = ? and anno_id = ?;"
                                        let markCheckParam = [req.session.member_email, req.body.anno_id]
                                        conn.query(markCheckSql, markCheckParam, function (error, rows) {
                                            if (error) {
                                                console.error(error)
                                                res.status(500).json({
                                                    content: "DB Error"
                                                })
                                            } else {
                                                if (rows.length === 0) {
                                                    // 즐겨찾기 삭제 불가.
                                                    if (req.body.marked_flag === 0) {
                                                        res.status(401).json({
                                                            content: false
                                                        })
                                                    } else {
                                                        // 즐겨찾기 등록
                                                        let insertMarkSql = "insert into inter_anno(member_email, anno_id) values(?, ?);"
                                                        let insertMarkParam = [req.session.member_email, req.body.anno_id]
                                                        conn.query(insertMarkSql, insertMarkParam, function (error) {
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
                                                    }
                                                } else {
                                                    // 즐겨찾기 삭제
                                                    if (req.body.marked_flag === 0) {
                                                        let deleteMarkSql = "delete from inter_anno where member_email = ? and anno_id = ?"
                                                        let deleteMarkParam = [req.session.member_email, req.body.anno_id]
                                                        conn.query(deleteMarkSql, deleteMarkParam, function (error) {
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
                                                    } else {
                                                        // 즐겨찾기 등록 불가
                                                        res.status(401).json({
                                                            content: false
                                                        })
                                                    }
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