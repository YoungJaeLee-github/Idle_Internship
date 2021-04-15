/**
 * --------------------------------------------------------------------------------------------------------
 * 모듈/필드 변수 부분
 * --------------------------------------------------------------------------------------------------------
 */
const express = require("express")
const app = express.Router()
const sessionConfig = require("../config/session_config.js")
const func = require("../common/function.js")
const getConnection = require("../config/database_config.js").getConnection
const crypto = require("../config/crypto_config.js")
const cron = require("node-cron")
const puppeteer = require("puppeteer")
const upload = require("../config/multer_config.js").upload
const fs = require("fs")
const path = require("path")
const logger = require("../config/winston_config.js").logger
const mailer = require("../config/mail_config.js")
const transporter = mailer.init()
const moment = require("moment")
app.use(sessionConfig.init())

/**
 * --------------------------------------------------------------------------------------------------------
 * Rank Scheduler 00 00 * * 1 매주 월요일 00 시 00분.
 * --------------------------------------------------------------------------------------------------------
 */
cron.schedule("00 00 * * 1", function () {
    // 정지 여부, 탈퇴 여부, 포인트 조회 후 정렬
    let searchPointSql = "select member_email, save_point, member_log_join\n" +
        "from (select m.member_email,\n" +
        "             m.save_point,\n" +
        "             ml.member_log_join,\n" +
        "             ROW_NUMBER() over (partition by m.member_email, m.save_point order by ml.member_log_join DESC) as rn\n" +
        "      from member m,\n" +
        "           member_log ml\n" +
        "      where m.member_email = ml.member_email\n" +
        "        and member_ban != ?\n" +
        "        and member_secede != ?) as memljr\n" +
        "where rn = ?;"
    let searchPointParam = [1, 1, 1]
    getConnection((conn) => {
        conn.query(searchPointSql, searchPointParam, function (error, rows) {
            if (error) {
                logger.error(error)
                console.error(error)
            } else {
                if (rows.length === 0) {
                    console.error(error)
                    logger.error(error)
                } else {
                    let structForRank = []
                    for (let i = 0; i < rows.length; i++) {
                        structForRank[i] = {
                            "member_email": rows[i].member_email,
                            "save_point": rows[i].save_point,
                            "member_log_join": rows[i].member_log_join,
                        }
                    }

                    // 정렬 후 순위 업데이트(정지 회원, 탈퇴 회원 이면 null)
                    structForRank.sort(function (member1, member2) {
                        if (member1.save_point < member2.save_point) {
                            return 1
                        } else if (member1.save_point === member2.save_point) {
                            return member1.member_log_join < member2.member_log_join ? -1 : 1
                        } else {
                            return -1
                        }
                    })

                    for (let i = 0; i < structForRank.length; i++)
                        structForRank[i].member_rank = i + 1

                    conn.beginTransaction()
                    let updateRankSql = ""
                    for (let i = 0; i < structForRank.length; i++)
                        updateRankSql += "update member set member_rank = " + conn.escape(structForRank[i].member_rank) + " where member_email = " + conn.escape(structForRank[i].member_email) + ";"
                    updateRankSql += "update member set member_rank = " + conn.escape(null) + " where member_ban = " + conn.escape(1) + " or member_secede = " + conn.escape(1) + ";"

                    conn.query(updateRankSql, function (error) {
                        if (error) {
                            conn.rollback()
                            console.error(error)
                            logger.error(error)
                        } else {
                            conn.commit()
                            console.log("Success Rank update.")
                            logger.info("Success Rank update.")
                        }
                    })
                }
            }
            conn.release()
        })
    })
}, {
    schedule: true,
    timezone: "Asia/Seoul"
})

/**
 * --------------------------------------------------------------------------------------------------------
 * crawling 매일 00시 00분, 00시 01분
 * --------------------------------------------------------------------------------------------------------
 */
async function getAll(page) {
    let data = []
    const number = await page.$$eval("#bbsWrap > table > tbody tr", (data) => data.length)
    for (let i = 0; i < number; i++) {
        data.push(await getOne(page, i + 1))
    }
    return Promise.resolve(data)
}

async function getOne(page, index) {
    let data = {}
    let titleData = await page.$("#bbsWrap > table > tbody > tr:nth-child(" + index + ") > td.tit > a")
    data.title = await page.evaluate((data) => {
        return data.textContent
    }, titleData)
    data.link = await page.evaluate((data) => {
        return data.href
    }, titleData)
    data.date = await page.$eval("#bbsWrap > table > tbody > tr:nth-child(" + index + ") > td.dt", (data) => data.textContent)

    return Promise.resolve(data)
}

async function listCrawling(page) {
    await page.goto("https://cse.kangwon.ac.kr/index.php?mp=6_1")
    getAll(page).then(data => {
        getConnection((conn) => {
            conn.beginTransaction()
            let insertSql = ""
            for (let i = 0; i < data.length; i++) {
                let bid = data[i].link.split("&")[8].split("=")[1]
                insertSql += "insert into anno(anno_title, anno_contents, anno_date, anno_link, anno_ref, anno_flag) select " + conn.escape(data[i].title) + ", " +
                    conn.escape(' ') + ", " + conn.escape(data[i].date) + ", " + conn.escape(data[i].link) + ", " + conn.escape('강원대학교 컴퓨터공학과') + ", " + conn.escape(bid * 1) +
                    " from dual where not exists(select * from anno where anno_flag = " + conn.escape(bid * 1) + ");"
            }
            conn.query(insertSql, function (error) {
                if (error) {
                    conn.rollback()
                    console.error(error)
                    logger.error(error)
                } else {
                    conn.commit()
                    console.log("Success Crawling.")
                    logger.info("Success Crawling.")
                }
                conn.release()
            })
        })
    }).catch(error => {
        console.error(error)
        logger.error(error)
    })
}

async function getCrawlingUrl() {
    return await new Promise((resolve, reject) => {
        let linkList = []
        let getLinkSql = "select anno_link, anno_flag from anno where anno_contents = ?;"
        let getLinkParam = [' ']
        getConnection((conn) => {
            conn.query(getLinkSql, getLinkParam, function (error, rows) {
                if (error) {
                    logger.error(error)
                    console.error(error)
                } else {
                    if (rows.length === 0) {
                        logger.info("Not exists announcement there.")
                        reject("Not exists announcement there.")
                    } else {
                        for (let i = 0; i < rows.length; i++)
                            linkList.push({
                                link: rows[i].anno_link,
                                bid: rows[i].anno_flag
                            })
                        logger.info("Success get crawling url.")
                        resolve(linkList)
                    }
                }
                conn.release()
            })
        });
    })
}

async function contentsCrawling(page) {
    getCrawlingUrl().then(async data => {
        let linkList = data
        let contents = []
        for (let i = 0; i < linkList.length; i++) {
            await page.goto(linkList[i].link)
            let htmlTempData = await page.$("#oxbbsPrintArea > div > div.note")
            let imgTempData = await page.$("#oxbbsPrintArea > div > div.note > div > a > img")

            let htmlData = await page.evaluate((data) => {
                return data === null ? null : data.innerHTML
            }, htmlTempData)
            let imgData = await page.evaluate((data) => {
                return data === null ? null : data.src
            }, imgTempData)

            if (htmlData === null)
                imgData === null ? contents.push({
                    htmlData: "empty",
                    imgData: "empty"
                }) : contents.push({htmlData: "empty", imgData: imgData})
            else
                imgData === null ? contents.push({
                    htmlData: htmlData,
                    imgData: "empty"
                }) : contents.push({htmlData: htmlData, imgData: imgData})
        }

        for (let i = 0; i < contents.length; i++) {
            if (contents[i].imgData === "empty")
                continue
            contents[i].htmlData = contents[i].htmlData.replace(/src="_/gi, 'src="https://cse.kangwon.ac.kr/_')
        }

        getConnection((conn) => {
            conn.beginTransaction()
            let updateSql = ""
            for (let i = 0; i < contents.length; i++)
                updateSql += "update anno set anno_contents = " + conn.escape(contents[i].htmlData) + " where anno_flag = " + conn.escape(linkList[i].bid) + ";"

            conn.query(updateSql, function (error) {
                if (error) {
                    conn.rollback()
                    console.error(error)
                    logger.error(error)
                } else {
                    conn.commit()
                    console.log("Insert Contents Success.")
                    logger.info("Insert Contents Success.")
                }
                conn.release()
            })
        })
    }).catch(error => {
        console.error(error)
        logger.error(error)
    })
}

cron.schedule("00 00 1-31 * *", async function () {
    console.log("list Crawling Start.")
    const browser = await puppeteer.launch({
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    })
    const page = await browser.newPage()
    await page.setViewport({
        width: 1920,
        height: 1080
    })

    await listCrawling(page)

    await page.waitFor(20000)
    await browser.close()
    console.log("list Crawling End.")
}, {
    scheduled: true,
    timezone: "Asia/Seoul"
})

cron.schedule("01 00 1-31 * *", async function () {
    console.log("Contents Crawling Start.")
    const browser = await puppeteer.launch({
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    })
    const page = await browser.newPage()
    await page.setViewport({
        width: 1920,
        height: 1080
    })

    await contentsCrawling(page)

    await page.waitFor(40000)
    await browser.close()

    console.log("Contents Crawling End.")
}, {
    scheduled: true,
    timezone: "Asia/Seoul"
})

/**
 * --------------------------------------------------------------------------------------------------------
 * API 구현 부분
 * --------------------------------------------------------------------------------------------------------
 */

/**
 * 관리자 API
 */
// 1. 사용자 조회
app.post("/member-check", (req, res) => {
    let checkEmail = req.body.member_email
    if (checkEmail === undefined) {
        res.status(401).json({
            content: false
        })
    } else {
        let emailCheckSql = "select member_email, member_secede, member_ban from member where member_email = ?;"
        let selectParam = [checkEmail]
        getConnection((conn) => {
            conn.query(emailCheckSql, selectParam, function (error, rows) {
                if (error) {
                    res.status(500).json({
                        content: "DB Error"
                    })
                } else {
                    let isEmail = rows.length === 0 ? null : rows[0].member_email
                    let value = func.emailCheck(isEmail)
                    // 중복된 이메일이 없음
                    if (value === 200) {
                        res.status(200).json({content: "empty"})
                    } else if (value === 401 && rows[0].member_secede === 0) {
                        // 정지되지 않은 회원.(정상적인 회원)
                        if (rows[0].member_ban === 0) {
                            res.status(200).json({content: "OK"})
                        } else {
                            // member_ban === 1 정지된 회원
                            res.status(401).json({content: "ban"})
                        }
                    } else {
                        // 탈퇴한 회원
                        res.status(401).json({content: "secede"})
                    }
                }
                conn.release()
            })
        })
    }
})

// 2. 관리자 조회
app.post('/check', (req, res) => {
    let adminEmail = req.body.admin_email
    if (adminEmail === undefined) {
        res.status(401).json({
            content: "Empty Param"
        })
    } else {
        let adminCheckSql = "select admin_email, admin_secede from admin where admin_email = ?;"
        let adminCheckParam = [adminEmail]
        getConnection((conn) => {
            conn.query(adminCheckSql, adminCheckParam, function (error, rows) {
                if (error) {
                    res.status(500).json({
                        content: "DB Error"
                    })
                } else {
                    let isEmail = rows.length === 0 ? null : rows[0].admin_email
                    let emailCheckValue = func.emailCheck(isEmail)
                    if (emailCheckValue === 200) {
                        res.status(200).json({
                            content: "No admin email."
                        })
                    } else if (emailCheckValue === 401 && rows[0].admin_secede === 1) {
                        res.status(200).json({
                            content: "No admin email."
                        })
                    } else {
                        res.status(401).json({
                            content: "Already exists admin email."
                        })
                    }
                }
                conn.release()
            })
        })
    }
})

// 3. 관리자 등록
app.post("/signup", (req, res) => {
    if (req.body.admin_email === undefined || req.body.admin_name === undefined || req.body.admin_sex === undefined ||
        req.body.admin_birth === undefined || req.body.admin_state === undefined || req.body.admin_pw === undefined || req.body.admin_phone === undefined) {
        res.status(401).json({
            content: false
        })
    } else {
        let adminEmail = req.body.admin_email
        let adminName = req.body.admin_name
        let adminSex = req.body.admin_sex
        let adminBirth = req.body.admin_birth
        let adminState = req.body.admin_state
        let adminPw = req.body.admin_pw
        let adminPhone = req.body.admin_phone
        let searchEmailSql = "select admin_email, admin_secede from admin where admin_email = ?;"
        let searchEmailParam = [adminEmail]
        let insertLogSql = "insert into admin_log(admin_email, admin_log_join, admin_login_lately) values(?, ?, ?);"
        let insertLogParam = [adminEmail, moment(new Date()).format("YYYY-MM-DD HH:mm:ss"), moment(new Date()).format("YYYY-MM-DD HH:mm:ss")]
        getConnection((conn) => {
            conn.query(searchEmailSql, searchEmailParam, function (error, rows) {
                if (error) {
                    console.error(error)
                    res.status(500).json({
                        content: "DB Error"
                    })
                } else {
                    let isEmail = rows.length === 0 ? null : rows[0].admin_email
                    let emailCheckValue = func.emailCheck(isEmail)
                    crypto.getSalt().then(salt => {
                        crypto.encryptByHash(adminPw, salt).then(encryptedPw => {
                            crypto.encryption(adminPhone).then(encryptedPhone => {
                                // 최초 등록
                                if (emailCheckValue === 200) {
                                    conn.beginTransaction()
                                    let signupSql = "insert into admin(admin_email, admin_name, admin_sex, admin_birth, admin_state, admin_pw, admin_phone, admin_secede, admin_salt) values(?, ?, ?, ?, ?, ?, ?, ?, ?);"
                                    let signupParam = [adminEmail, adminName, adminSex, adminBirth, adminState, encryptedPw, encryptedPhone, 0, salt]
                                    conn.query(signupSql, signupParam, function (error) {
                                        if (error) {
                                            conn.rollback()
                                            console.error(error)
                                            res.status(500).json({
                                                content: "DB Error"
                                            })
                                        } else {
                                            console.log("admin signup success.")
                                            req.session.admin_email = adminEmail
                                            req.session.admin_pw = encryptedPw
                                            req.session.save(function (error) {
                                                if (error) {
                                                    conn.rollback()
                                                    res.status(500).json({
                                                        content: "Session Error"
                                                    })
                                                } else {
                                                    conn.commit()
                                                    // TODO 메인 페이지로 redirect
                                                    res.status(200).json({
                                                        content: true
                                                    })
                                                }
                                            })
                                        }
                                    })

                                    // log
                                    conn.beginTransaction()
                                    conn.query(insertLogSql, insertLogParam, function (error) {
                                        if (error) {
                                            conn.rollback()
                                            console.error(error)
                                            res.status(500).json({
                                                content: "DB Error"
                                            })
                                        } else {
                                            conn.commit()
                                            console.log("insert log success.")
                                        }
                                    })
                                } else {
                                    // 재등록.
                                    if (rows[0].admin_secede === 1) {
                                        conn.beginTransaction()
                                        let updateSignupSql = "update admin set admin_name = ?, admin_sex = ?, admin_birth = ?, admin_state = ?, admin_pw = ?, admin_phone = ?, admin_secede = ?, admin_salt = ? where admin_email = ?;"
                                        let updateSignupParam = [adminName, adminSex, adminBirth, adminState, encryptedPw, encryptedPhone, 0, salt, adminEmail]
                                        conn.query(updateSignupSql, updateSignupParam, function (error) {
                                            if (error) {
                                                conn.rollback()
                                                res.status(500).json({
                                                    content: "DB Error"
                                                })
                                            } else {
                                                console.log("admin signup(update) success.")
                                                req.session.admin_email = adminEmail
                                                req.session.admin_pw = encryptedPw
                                                req.session.save(function (error) {
                                                    if (error) {
                                                        conn.rollback()
                                                        res.status(500).json({
                                                            content: "Session Error"
                                                        })
                                                    } else {
                                                        // TODO 메인 페이지로 redirect
                                                        conn.commit()
                                                        res.status(200).json({
                                                            content: true
                                                        })
                                                    }
                                                })
                                            }
                                        })

                                        // log
                                        conn.query(insertLogSql, insertLogParam, function (error) {
                                            if (error) {
                                                console.error(error)
                                                res.status(500).json({
                                                    content: "DB Error"
                                                })
                                            } else {
                                                console.log("insert log success.")
                                            }
                                        })
                                    } else {
                                        // 이미 가입 되어 있는 회원.
                                        res.status(401).json({
                                            content: "already exists."
                                        })
                                    }
                                }
                            }).catch(error => {
                                console.error(error)
                            })
                        }).catch(error => {
                            console.error(error)
                        })
                    }).catch(error => {
                        console.error(error)
                    })
                }
                conn.release()
            })
        })
    }
})

// 4. 관리자 로그인
app.post("/login", (req, res) => {
    if (req.body.admin_email === undefined || req.body.admin_pw === undefined) {
        res.status(401).json({
            content: false
        })
    } else {
        let adminEmail = req.body.admin_email
        let adminPw = req.body.admin_pw
        let searchEmailSql = "select admin_email, admin_secede, admin_salt, admin_pw from admin where admin_email = ?;"
        let searchEmailParam = [adminEmail]
        getConnection((conn) => {
            conn.query(searchEmailSql, searchEmailParam, function (error, rows) {
                if (error) {
                    console.error(error)
                    res.status(500).json({
                        content: "DB Error"
                    })
                } else {
                    let emailCheckValue = func.emailCheck(rows.length === 0 ? null : rows[0].admin_email)
                    if (emailCheckValue === 200) {
                        res.status(401).json({
                            content: "Wrong Email"
                        })
                    } else {
                        // 탈퇴한 관리자.
                        if (rows[0].admin_secede === 1) {
                            res.status(401).json({
                                content: "secede admin"
                            })
                        }
                        // 정상적인 관리자.
                        else {
                            crypto.encryptByHash(adminPw, rows[0].admin_salt).then(encryptedPw => {
                                if (encryptedPw === rows[0].admin_pw) {
                                    req.session.admin_email = adminEmail
                                    req.session.admin_pw = encryptedPw
                                    req.session.save(function (error) {
                                        if (error) {
                                            res.status(500).json({
                                                content: "Session Error"
                                            })
                                        } else {
                                            // TODO 메인페이지로
                                            res.status(200).json({
                                                content: "Login"
                                            })
                                        }
                                    })
                                    conn.beginTransaction()
                                    let updateLogSql = "update admin_log set admin_login_lately = ? where admin_email = ?;"
                                    let updateLogParam = [moment(new Date()).format("YYYY-MM-DD HH:mm:ss"), adminEmail]
                                    conn.query(updateLogSql, updateLogParam, function (error) {
                                        if (error) {
                                            console.error(error)
                                            res.status(500).json({
                                                content: "DB Error"
                                            })
                                        } else {
                                            console.log("update login log success.")
                                        }
                                    })
                                } else {
                                    res.status(401).json({
                                        content: "Wrong Password"
                                    })
                                }
                            }).catch(error => {
                                console.error(error)
                            })
                        }
                    }
                }
                conn.release()
            })
        })
    }
})

// 5. 관리자 로그아웃
app.post("/logout", (req, res) => {
    req.session.destroy()
    // TODO 로그인 페이지로
    res.status(200).json({
        content: "Logout"
    })
})

// 6. 관리자 제외
app.delete("/secede", (req, res) => {
    let rootEmail = req.session.admin_email
    if (rootEmail === undefined || req.body.secede_email === undefined || req.body.root_pw === undefined) {
        res.status(401).json({
            content: "Wrong access."
        })
    } else {
        let secedeEmail = req.body.secede_email
        let rootPw = req.body.root_pw
        let searchEmailSql = "select admin_email, admin_secede from admin where admin_email = ?;"
        let searchEmailParam = [secedeEmail]
        getConnection((conn) => {
            conn.query(searchEmailSql, searchEmailParam, function (error, rows) {
                if (error) {
                    console.error(error)
                    res.status(500).json({
                        content: "DB Error"
                    })
                } else {
                    let emailCheckValue = func.emailCheck(rows.length === 0 ? null : rows[0].admin_email)
                    if (emailCheckValue === 200) {
                        res.status(401).json({
                            content: false
                        })
                    } else {
                        if (rows[0].admin_secede === 1) {
                            res.status(401).json({
                                content: false
                            })
                        } else {
                            let searchSaltSql = "select admin_salt from admin where admin_email = ?;"
                            let searchSaltParam = [rootEmail]
                            conn.query(searchSaltSql, searchSaltParam, function (error, rows) {
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
                                        crypto.encryptByHash(rootPw, rows[0].admin_salt).then(encryptedPw => {
                                            if (encryptedPw === req.session.admin_pw) {
                                                let updateSecedeSql = "update admin set admin_secede = ? where admin_email = ?;"
                                                let updateSecedeParam = [1, secedeEmail]
                                                conn.query(updateSecedeSql, updateSecedeParam, function (error) {
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
                                                res.status(401).json({
                                                    content: false
                                                })
                                            }
                                        }).catch(error => {
                                            console.error(error)
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

// 7. 사용자 정지
app.patch("/member-ban", (req, res) => {
    let adminEmail = req.session.admin_email
    if (adminEmail === undefined || req.body.member_email === undefined || req.body.member_ban_reason === undefined || req.body.admin_pw === undefined) {
        res.status(401).json({
            content: false
        })
    } else {
        let todoBanMemberEmail = req.body.member_email
        let banReason = req.body.member_ban_reason
        let adminPw = req.body.admin_pw
        let searchEmailSql = "select member_email, member_secede, member_ban from member where member_email = ?;"
        let searchEmailParam = [todoBanMemberEmail]
        getConnection((conn) => {
            conn.query(searchEmailSql, searchEmailParam, function (error, rows) {
                if (error) {
                    console.error(error)
                    res.status(500).json({
                        content: "DB Error"
                    })
                } else {
                    let emailCheckValue = func.emailCheck(rows.length === 0 ? null : rows[0].member_email)
                    if (emailCheckValue === 200) {
                        res.status(401).json({
                            content: false
                        })
                    } else {
                        if (rows[0].member_secede === 1 || rows[0].member_ban === 1) {
                            res.status(401).json({
                                content: false
                            })
                        } else {
                            let searchSaltSql = "select admin_salt from admin where admin_email = ?;"
                            let searchSaltParam = [adminEmail]
                            conn.query(searchSaltSql, searchSaltParam, function (error, rows) {
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
                                        crypto.encryptByHash(adminPw, rows[0].admin_salt).then(encryptedPw => {
                                            if (encryptedPw === req.session.admin_pw) {
                                                let searchBanEmailSql = "select member_email from member_ban where member_email = ?"
                                                let searchBanEmailParam = [todoBanMemberEmail]
                                                let updateBanSql = "update member set member_ban = ? where member_email = ?"
                                                let updateBanParam = [1, todoBanMemberEmail]
                                                conn.query(searchBanEmailSql, searchBanEmailParam, function (error, rows) {
                                                    if (error) {
                                                        console.error(error)
                                                        res.status(500).json({
                                                            content: "DB Error"
                                                        })
                                                    } else {
                                                        let emailCheckValue = func.emailCheck(rows.length === 0 ? null : rows[0].member_email)
                                                        // 처음 정지 될 때
                                                        if (emailCheckValue === 200) {
                                                            let insertBanSql = "insert into member_ban(member_email, member_ban_reason, member_ban_date, admin_email) values(?, ? ,?, ?);"
                                                            let insertBanParam = [todoBanMemberEmail, banReason, moment(new Date()).format("YYYY-MM-DD HH:mm:ss"), adminEmail]
                                                            conn.query(insertBanSql, insertBanParam, function (error) {
                                                                if (error) {
                                                                    console.error(error)
                                                                    res.status(500).json({
                                                                        content: "DB Error"
                                                                    })
                                                                } else {
                                                                    console.log("insert ban success.")
                                                                }
                                                            })
                                                        } else {
                                                            // 정지 해제 후 다시 정지 될 때
                                                            let updateReBanSql = "update member_ban set member_ban_reason = ?, member_ban_date = ?, admin_email = ? where member_email = ?;"
                                                            let updateReBanParam = [banReason, moment(new Date()).format("YYYY-MM-DD HH:mm:ss"), adminEmail, todoBanMemberEmail]
                                                            conn.query(updateReBanSql, updateReBanParam, function (error) {
                                                                if (error) {
                                                                    console.error(error)
                                                                    res.status(500).json({
                                                                        content: "DB Error"
                                                                    })
                                                                } else {
                                                                    console.log("update ban success.")
                                                                }
                                                            })
                                                        }
                                                    }
                                                })

                                                conn.query(updateBanSql, updateBanParam, function (error) {
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
                                                res.status(401).json({
                                                    content: false
                                                })
                                            }
                                        }).catch(error => {
                                            console.error(error)
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

// 8. 사용자 정지 해제
app.patch("/member-ban-release", (req, res) => {
    let adminEmail = req.session.admin_email
    if (adminEmail === undefined || req.body.member_email === undefined || req.body.member_ban_reason === undefined || req.body.admin_pw === undefined) {
        res.status(401).json({
            content: false
        })
    } else {
        let todoReleaseEmail = req.body.member_email
        let releaseReason = req.body.member_ban_reason
        let adminPw = req.body.admin_pw
        let searchEmailSql = "select member_email, member_secede, member_ban from member where member_email = ?;"
        let searchEmailParam = [todoReleaseEmail]
        getConnection((conn) => {
            conn.query(searchEmailSql, searchEmailParam, function (error, rows) {
                if (error) {
                    console.error(error)
                    res.status(500).json({
                        content: "DB Error"
                    })
                } else {
                    let emailCheckValue = func.emailCheck(rows.length === 0 ? null : rows[0].member_email)
                    if (emailCheckValue === 200) {
                        res.status(401).json({
                            content: false
                        })
                    } else {
                        if (rows[0].member_secede === 1 || rows[0].member_ban === 0) {
                            res.status(401).json({
                                content: false
                            })
                        }
                        else {
                            let searchSaltSql = "select admin_salt from admin where admin_email = ?;"
                            let searchSaltParam = [adminEmail]
                            conn.query(searchSaltSql, searchSaltParam, function (error, rows) {
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
                                    }
                                    else {
                                        crypto.encryptByHash(adminPw, rows[0].admin_salt).then(encryptedPw => {
                                            if (encryptedPw === req.session.admin_pw) {
                                                let updateBanLogSql = "update member_ban set member_ban_reason = ?, member_ban_date = ?, admin_email = ? where member_email = ?;"
                                                let updateBanLogParam = [releaseReason, moment(new Date()).format("YYYY-MM-DD HH:mm:ss"), adminEmail, todoReleaseEmail]
                                                let updateBanSql = "update member set member_ban = ? where member_email = ?"
                                                let updateBanParam = [0, todoReleaseEmail]

                                                conn.query(updateBanLogSql, updateBanLogParam, function (error) {
                                                    if (error) {
                                                        console.error(error)
                                                        res.status(500).json({
                                                            content: "DB Error"
                                                        })
                                                    } else {
                                                        console.log("Release Ban Success.")
                                                    }
                                                })

                                                conn.query(updateBanSql, updateBanParam, function (error) {
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
                                                res.status(401).json({
                                                    content: false
                                                })
                                            }
                                        }).catch(error => {
                                            console.error(error)
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

// 9. 아이디어 삭제
app.delete("/idea/remove", (req, res) => {
    if (req.body.idea_id === undefined || req.session.admin_email === undefined) {
        res.status(401).json({
            content: false
        })
    }
    else {
        let searchIdeaSql = "select idea_delete, add_point from idea where idea_id = ?;"
        let searchIdeaParam = [req.body.idea_id]
        getConnection((conn) => {
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
                    }
                    else {
                        if (rows[0].idea_delete === 1) {
                            res.status(401).json({
                                content: false
                            })
                        }
                        else {
                            let originalPoint = rows[0].add_point
                            if (originalPoint === null) {
                                res.status(401).json({
                                    content: false
                                })
                            } else {
                                let memberCheckSql = "select member_ban, member_secede, member.member_email, member.save_point, member.use_point from member join idea on member.member_email = idea.member_email where idea_id = ?;"
                                let memberCheckParam = [req.body.idea_id]
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
                                                res.status(404).json({
                                                    content: false
                                                })
                                            } else {
                                                let memberEmail = rows[0].member_email
                                                let todoAddSavePoint = rows[0].save_point - originalPoint
                                                let todoAddMemberPoint = todoAddSavePoint - rows[0].use_point
                                                let totalSql = "update idea set idea_delete = " + conn.escape(1) + ", admin_email = " +
                                                    conn.escape(req.session.admin_email) + " where idea_id = " + conn.escape(req.body.idea_id) + ";"
                                                totalSql += " insert into point(member_email, use_date, use_contents, point) values(" +
                                                    conn.escape(memberEmail) + ", " + conn.escape(moment(new Date()).format("YYYY-MM-DD")) + ", " + conn.escape("아이디어 삭제") + ", " +
                                                    conn.escape(originalPoint) + ");"
                                                totalSql += " update member set member_point = " + conn.escape(todoAddMemberPoint) + ", save_point = " +
                                                    conn.escape(todoAddSavePoint) + " where member_email = " + conn.escape(memberEmail) + ";"
                                                conn.query(totalSql, function (error) {
                                                    if (error) {
                                                        console.error(error)
                                                        res.status(500).json({
                                                            content: "DB Error"
                                                        })
                                                    } else {
                                                        console.log("success remove idea.")
                                                        res.status(200).json({
                                                            content: true
                                                        })
                                                    }
                                                })
                                            }
                                        }
                                    }
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

// 10. 포인트 부여
app.patch("/point/give", (req, res) => {
    if (req.session.admin_email === undefined || req.body.idea_id === undefined || req.body.add_point === undefined)
        res.status(401).json({
            content: false
        })
    else {
        let ideaId = req.body.idea_id
        let givePoint = req.body.add_point
        let searchIdeaSql = "select idea_id, idea_delete, add_point from idea where idea_id = ?"
        let searchIdeaParam = [ideaId]
        getConnection((conn) => {
            conn.query(searchIdeaSql, searchIdeaParam, function (error, rows) {
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
                        if (rows[0].idea_delete === 1)
                            res.status(401).json({
                                content: false
                            })
                        else {
                            let originalPoint = rows[0].add_point
                            let selectPointSql = "select save_point, use_point, member_ban, member_secede from member where member_email = (select member_email from idea where idea_id = ?)"
                            let selectPointParam = [ideaId]
                            conn.query(selectPointSql, selectPointParam, function (error, rows) {
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
                                        if (rows[0].member_secede === 1 || rows[0].member_ban === 1)
                                            res.status(401).json({
                                                content: false
                                            })
                                        else {
                                            let updateIdeaPointSql = "update idea set admin_email = ?, add_point = ?, date_point = ? where idea_id = ?"
                                            let updateIdeaPointParam = [req.session.admin_email, givePoint + originalPoint, moment(new Date()).format("YYYY-MM-DD HH:mm:ss"), ideaId]
                                            conn.query(updateIdeaPointSql, updateIdeaPointParam, function (error, rows) {
                                                if (error) {
                                                    console.error(error)
                                                    res.status(500).json({
                                                        content: "DB Error"
                                                    })
                                                } else
                                                    console.log("Success give point.")
                                            })

                                            let updatePointSql = "update member set member_point = ?, save_point = ? where member_email = (select member_email from idea where idea_id = ?)"
                                            let todoAddSavePoint = rows[0].save_point + givePoint
                                            let todoAddMemberPoint = todoAddSavePoint - rows[0].use_point
                                            let updatePointParam = [todoAddMemberPoint, todoAddSavePoint, ideaId]
                                            conn.query(updatePointSql, updatePointParam, function (error, rows) {
                                                if (error) {
                                                    console.error(error)
                                                    res.status(500).json({
                                                        content: "DB Error"
                                                    })
                                                } else {
                                                    console.log("Success update member point")
                                                    res.status(200).json({
                                                        content: true
                                                    })
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

// 11. 포인트 회수
app.patch("/point/cancel", (req, res) => {
    //idea 테이블 에서 idea id 조회 후 관리자 이메일, 얻은 포인트, 변동일자 업데이트.
    if (req.session.admin_email === undefined || req.body.idea_id === undefined || req.body.cancel_point === undefined)
        res.status(401).json({
            content: false
        })
    else {
        let ideaId = req.body.idea_id
        let searchIdeaSql = "select idea_id, idea_delete, add_point from idea where idea_id = ?;"
        let searchIdeaParam = [ideaId]
        getConnection((conn) => {
            conn.query(searchIdeaSql, searchIdeaParam, function (error, rows) {
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
                        if (rows[0].idea_delete === 1)
                            res.status(401).json({
                                content: false
                            })
                        else {
                            let originalPoint = rows[0].add_point
                            let searchMemberPointSql = "select save_point, use_point, member_ban, member_secede from member where member_email = (select member_email from idea where idea_id = ?);"
                            let searchMemberPointParam = [ideaId]
                            conn.query(searchMemberPointSql, searchMemberPointParam, function (error, rows) {
                                if (error) {
                                    console.error(error)
                                    res.status(500).json({
                                        content: "DB Error"
                                    })
                                } else {
                                    if (rows[0].length === 0)
                                        res.status(401).json({
                                            content: false
                                        })
                                    else {
                                        if (rows[0].member_ban === 1 || rows[0].member_secede === 1)
                                            res.status(401).json({
                                                content: false
                                            })
                                        else {
                                            if (originalPoint === null || originalPoint === 0)
                                                res.status(401).json({
                                                    content: false
                                                })
                                            else {
                                                let updateIdeaPointSql = "update idea set admin_email = ?, add_point = ?, date_point = ? where idea_id = ?;"
                                                let updateIdeaPointParam = [req.session.admin_email, originalPoint - req.body.cancel_point, moment(new Date()).format("YYYY-MM-DD HH:mm:ss"), ideaId]
                                                conn.query(updateIdeaPointSql, updateIdeaPointParam, function (error, rows) {
                                                    if (error) {
                                                        console.error(error)
                                                        res.status(500).json({
                                                            content: "DB Error"
                                                        })
                                                    } else
                                                        console.log("Success update idea point.")
                                                })
                                                // point 테이블 insert.
                                                let insertPointSql = "insert into point (member_email, use_date, use_contents, point) values((select member_email from idea where idea_id = ?), ?, ?, ?);"
                                                let insertPointParam = [ideaId, moment(new Date()).format("YYYY-MM-DD"), "회수", req.body.cancel_point]
                                                conn.query(insertPointSql, insertPointParam, function (error, rows) {
                                                    if (error) {
                                                        console.error(error)
                                                        res.status(500).json({
                                                            content: "DB Error"
                                                        })
                                                    } else {
                                                        console.log("Success Insert point.")
                                                    }
                                                })
                                                // member 테이블에서 누적 포인트, 사용 포인트 조회 후 누적포인트, 사용자포인트 업데이트.
                                                let updateMemberPointSql = "update member set member_point = ?, save_point = ? where member_email = (select member_email from idea where idea_id = ?);"
                                                let todoAddSavePoint = rows[0].save_point - req.body.cancel_point
                                                let todoAddMemberPoint = todoAddSavePoint - rows[0].use_point
                                                let updateMemberPointParam = [todoAddMemberPoint, todoAddSavePoint, ideaId]
                                                conn.query(updateMemberPointSql, updateMemberPointParam, function (error, rows) {
                                                    if (error) {
                                                        console.error(error)
                                                        res.status(500).json({
                                                            content: "DB Error"
                                                        })
                                                    } else {
                                                        console.log(("Success update member point."))
                                                        res.status(200).json({
                                                            content: true
                                                        })
                                                    }
                                                })
                                            }
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

// 12. 포인트 조회
app.post("/point/check", (req, res) => {
    if (req.session.admin_email === undefined || req.body.member_email === undefined)
        res.status(401).json({
            content: false
        })
    else {
        let memberEmail = req.body.member_email
        let searchPointSql = "select member_point, save_point, use_point, member_ban, member_secede from member where member_email = ?"
        let searchPointParam = [memberEmail]
        getConnection((conn) => {
            conn.query(searchPointSql, searchPointParam, function (error, rows) {
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
                        if (rows[0].member_secede === 1 || rows[0].member_ban === 1)
                            res.status(401).json({
                                content: false
                            })
                        else {
                            let responseData = rows[0]
                            res.status(200).json({
                                responseData
                            })
                        }
                    }
                }
                conn.release()
            })
        })
    }
})

// 13. 공지사항 작성
app.post("/notice/regist", upload.any(), (req, res) => {
    if (req.session.admin_email === undefined || req.body.notice_title === undefined || req.body.notice_contents === undefined) {
        for (let i = 0; i < req.files.length; i++) {
            fs.unlink(req.files[i].path, (error) => error ? console.error(error) : console.log("Success delete file"))
        }
        res.status(401).json({
            content: false
        })
    } else {
        getConnection((conn) => {
            let insertNoticeSql = "insert into notice(notice_title, notice_contents, notice_date, admin_email, notice_delete) values(" + conn.escape(req.body.notice_title)
                + ", " + conn.escape(req.body.notice_contents) + ", " + conn.escape(moment(new Date()).format("YYYY-MM-DD")) + ", " + conn.escape(req.session.admin_email) + ", " + conn.escape(0) + ");"
            conn.query(insertNoticeSql, function (error) {
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
                        console.log("insert notice success.")
                        res.status(200).json({
                            content: true
                        })
                    } else {
                        let insertFileSql = ""
                        for (let i = 0; i < req.files.length; i++)
                            insertFileSql += "insert into notice_file_dir(notice_file_name, notice_file_path, notice_id) values(" + conn.escape(req.files[i].originalname) +
                                ", " + conn.escape(req.files[i].path) + ", " + "(select notice_id from notice where admin_email = " + conn.escape(req.session.admin_email) +
                                " order by notice_id desc limit " + conn.escape(1) + "));"
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
                                console.log("insert notice & file success.")
                                res.status(200).json({
                                    content: true
                                })
                            }
                        })
                    }
                }
                conn.release()
            })
        })
    }
})

// 14. 공지사항 수정
app.patch("/notice/edit", upload.any(), (req, res) => {
    if (req.session.admin_email === undefined || req.body.notice_id === undefined || req.body.notice_title === undefined || req.body.notice_contents === undefined) {
        for (let i = 0; i < req.files.length; i++) {
            fs.unlink(req.files[i].path, (error) => error ? console.error(error) : console.log("Success delete file"))
        }
        res.status(401).json({
            content: false
        })
    } else {
        getConnection((conn) => {
            let deleteCheckSql = "select notice_delete from notice where notice_id = ?;"
            let deleteCheckParam = [req.body.notice_id]
            conn.query(deleteCheckSql, deleteCheckParam, function (error, rows) {
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
                        if (rows[0].notice_delete === 1) {
                            for (let i = 0; i < req.files.length; i++) {
                                fs.unlink(req.files[i].path, (error) => error ? console.error(error) : console.log("Success delete file"))
                            }
                            res.status(401).json({
                                content: false
                            })
                        } else {
                            let checkLogSql = "select notice_id from notice_log where notice_id = ?;"
                            let checkLogParam = [req.body.notice_id]
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
                                    let fileCheckSql = "select notice_id, notice_file_path from notice_file_dir where notice_id = ?;"
                                    let fileCheckParam = [req.body.notice_id]
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
                                                        let editTotalSql = "update notice set notice_title = " + conn.escape(req.body.notice_title) +
                                                            ", notice_contents = " + conn.escape(req.body.notice_contents) + " where notice_id = " + conn.escape(req.body.notice_id)
                                                            + "; insert into notice_log(notice_id, notice_edit_date, edit_admin_email) values(" + conn.escape(req.body.notice_id) + ", " +
                                                            conn.escape(moment(new Date()).format("YYYY-MM-DD HH:mm:ss")) + ", " + conn.escape(req.session.admin_email) + ");"
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
                                                            fs.unlink(rows[i].notice_file_path, (error) => error ? console.error(error) : console.log("Success delete file"))
                                                        }

                                                        let editTotalSql = "delete from notice_file_dir where notice_id = " + conn.escape(req.body.notice_id) +
                                                            "; update notice set notice_title = " + conn.escape(req.body.notice_title) + ", notice_contents = " + conn.escape(req.body.notice_contents) +
                                                            " where notice_id = " + conn.escape(req.body.notice_id) +
                                                            "; insert into notice_log(notice_id, notice_edit_date, edit_admin_email) values(" + conn.escape(req.body.notice_id) + ", " + conn.escape(moment(new Date()).format("YYYY-MM-DD HH:mm:ss")) +
                                                            ", " + conn.escape(req.session.admin_email) + ");"
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
                                                        let editTotalSql = "update notice set notice_title = " + conn.escape(req.body.notice_title)
                                                            + ", notice_contents = " + conn.escape(req.body.notice_contents) + " where notice_id = " + conn.escape(req.body.notice_id) + ";"
                                                        for (let i = 0; i < req.files.length; i++) {
                                                            editTotalSql += "insert into notice_file_dir(notice_id, notice_file_name, notice_file_path) values(" + conn.escape(req.body.notice_id) +
                                                                ", " + conn.escape(req.files[i].originalname) + ", " + conn.escape(req.files[i].path) + ");"
                                                        }
                                                        editTotalSql += "insert into notice_log(notice_id, notice_edit_date, edit_admin_email) values(" + conn.escape(req.body.notice_id)
                                                            + ", " + conn.escape(moment(new Date()).format("YYYY-MM-DD HH:mm:ss")) + ", " + conn.escape(req.session.email) + ");"
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
                                                            fs.unlink(rows[i].notice_file_path, (error) => error ? console.error(error) : console.log("Success delete file"))
                                                        }

                                                        let editTotalSql = "delete from notice_file_dir where notice_id = " + conn.escape(req.body.notice_id) + ";"
                                                        editTotalSql += "update notice set notice_title = " + conn.escape(req.body.notice_title) + ", notice_contents = " +
                                                            conn.escape(req.body.notice_contents) + " where notice_id = " + conn.escape(req.body.notice_id) + ";"

                                                        for (let i = 0; i < req.files.length; i++) {
                                                            editTotalSql += "insert into notice_file_dir(notice_id, notice_file_name, notice_file_path) values(" + conn.escape(req.body.notice_id) +
                                                                ", " + conn.escape(req.files[i].originalname) + ", " + conn.escape(req.files[i].path) + ");"
                                                        }
                                                        editTotalSql += "insert into notice_log(notice_id, notice_edit_date, edit_admin_email) values(" + conn.escape(req.body.notice_id) +
                                                            ", " + conn.escape(moment(new Date()).format("YYYY-MM-DD HH:mm:ss")) + ", " + conn.escape(req.session.admin_email) + ");"

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
                                                        let editTotalSql = "update notice set notice_title = " + conn.escape(req.body.notice_title) +
                                                            ", notice_contents = " + conn.escape(req.body.notice_contents) + " where notice_id = " + conn.escape(req.body.notice_id)
                                                            + "; update notice_log set notice_edit_date = " + conn.escape(moment(new Date()).format("YYYY-MM-DD HH:mm:ss")) + ", edit_admin_email = " + conn.escape(req.session.admin_email)
                                                            + " where notice_id = " + conn.escape(req.body.notice_id) + ";"
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
                                                            fs.unlink(rows[i].notice_file_path, (error) => error ? console.error(error) : console.log("Success delete file"))
                                                        }

                                                        let editTotalSql = "delete from notice_file_dir where notice_id = " + conn.escape(req.body.notice_id) +
                                                            "; update notice set notice_title = " + conn.escape(req.body.notice_title) + ", notice_contents = " + conn.escape(req.body.notice_contents) +
                                                            " where notice_id = " + conn.escape(req.body.notice_id) +
                                                            "; update notice_log set notice_edit_date = " + conn.escape(moment(new Date()).format("YYYY-MM-DD HH:mm:ss")) + ", edit_admin_email = " + conn.escape(req.session.admin_email)
                                                            + " where notice_id = " + conn.escape(req.body.notice_id) + ";"
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
                                                        let editTotalSql = "update notice set notice_title = " + conn.escape(req.body.notice_title)
                                                            + ", notice_contents = " + conn.escape(req.body.notice_contents) + " where notice_id = " + conn.escape(req.body.notice_id) + ";"
                                                        for (let i = 0; i < req.files.length; i++) {
                                                            editTotalSql += "insert into notice_file_dir(notice_id, notice_file_name, notice_file_path) values(" + conn.escape(req.body.notice_id) +
                                                                ", " + conn.escape(req.files[i].originalname) + ", " + conn.escape(req.files[i].path) + ");"
                                                        }
                                                        editTotalSql += "update notice_log set notice_edit_date = " + conn.escape(moment(new Date()).format("YYYY-MM-DD HH:mm:ss")) + ", edit_admin_email = " + conn.escape(req.session.admin_email)
                                                            + " where notice_id = " + conn.escape(req.body.notice_id) + ";"
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
                                                            fs.unlink(rows[i].notice_file_path, (error) => error ? console.error(error) : console.log("Success delete file"))
                                                        }

                                                        let editTotalSql = "delete from notice_file_dir where notice_id = " + conn.escape(req.body.notice_id) + ";"
                                                        editTotalSql += "update notice set notice_title = " + conn.escape(req.body.notice_title) + ", notice_contents = " +
                                                            conn.escape(req.body.notice_contents) + " where notice_id = " + conn.escape(req.body.notice_id) + ";"

                                                        for (let i = 0; i < req.files.length; i++) {
                                                            editTotalSql += "insert into notice_file_dir(notice_id, notice_file_name, notice_file_path) values(" + conn.escape(req.body.notice_id) +
                                                                ", " + conn.escape(req.files[i].originalname) + ", " + conn.escape(req.files[i].path) + ");"
                                                        }
                                                        editTotalSql += "update notice_log set notice_edit_date = " + conn.escape(moment(new Date()).format("YYYY-MM-DD HH:mm:ss")) + ", edit_admin_email = " + conn.escape(req.session.admin_email)
                                                            + " where notice_id = " + conn.escape(req.body.notice_id) + ";"

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
                        }
                    }
                }
                conn.release()
            })
        })
    }
})

// 15. 공지사항 삭제
app.delete("/notice/remove", (req, res) => {
    if (req.session.admin_email === undefined || req.body.notice_id === undefined)
        res.status(401).json({
            content: false
        })
    else {
        getConnection((conn) => {
            let checkNoticeSql = "select notice_delete from notice where notice_id = ?"
            let checkNoticeParam = [req.body.notice_id]
            conn.query(checkNoticeSql, checkNoticeParam, function (error, rows) {
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
                        if (rows[0].notice_delete === 1)
                            res.status(401).json({
                                content: false
                            })
                        else {
                            let deleteNoticeSql = "update notice set notice_delete = ? where notice_id = ?"
                            let deleteNoticeParam = [1, req.body.notice_id]
                            conn.query(deleteNoticeSql, deleteNoticeParam, function (error) {
                                if (error) {
                                    console.error(error)
                                    res.status(500).json({
                                        content: "DB Error"
                                    })
                                } else {
                                    console.log("Success Delete notice")
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

// 16. 문의글 답변 작성/수정
app.post("/cs/resp/regist", (req, res) => {
    if (req.session.admin_email === undefined || req.body.cs_id === undefined || req.body.cs_resp === undefined)
        res.status(401).json({
            content: false
        })
    else {
        getConnection((conn) => {
            let checkCsSql = "select cs_delete from cs where cs_id = ?"
            let checkCsParam = [req.body.cs_id]
            conn.query(checkCsSql, checkCsParam, function (error, rows) {
                if (error) {
                    console.error(error)
                    res.status(500).json({
                        content: "DB Error"
                    })
                } else {
                    // 존재하는 문의글인지 검사.
                    if (rows.length === 0) {
                        res.status(401).json({
                            content: false
                        })
                    } else {
                        // 삭제 여부 검사.
                        if (rows[0].cs_delete === 1) {
                            res.status(401).json({
                                content: false
                            })
                        } else {
                            let updateCsRespSql = "update cs set admin_email = ?, cs_resp = ?, cs_resp_date = ? where cs_id = ?"
                            let updateCsRespParam = [req.session.admin_email, '첫 번째 답변 입니다.', moment(new Date()).format("YYYY-MM-DD"), req.body.cs_id]
                            conn.query(updateCsRespSql, updateCsRespParam, function (error) {
                                if (error) {
                                    console.error(error)
                                    res.status(500).json({
                                        content: "DB Error"
                                    })
                                } else {
                                    console.log("Success update cs response.")
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

// 17. 문의글 삭제
app.delete("/cs/remove", (req, res) => {
    if (req.session.admin_email === undefined || req.body.cs_id === undefined)
        res.status(401).json({
            content: false
        })
    else {
        getConnection((conn) => {
            let checkCsSql = "select cs_delete from cs where cs_id = ?"
            let checkCsParam = [req.body.cs_id]
            conn.query(checkCsSql, checkCsParam, function (error, rows) {
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
                        if (rows[0].cs_delete === 1)
                            res.status(401).json({
                                content: false
                            })
                        else {
                            let deleteCsSql = "update cs set cs_delete = ? where cs_id = ?"
                            let deleteCsParam = [1, req.body.cs_id]
                            conn.query(deleteCsSql, deleteCsParam, function (error) {
                                if (error) {
                                    console.error(error)
                                    res.status(500).json({
                                        content: "DB Error"
                                    })
                                } else {
                                    console.log("Success Delete cs")
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

// 18. 아이디어 조회(관리자)
app.get("/idea/list", (req, res) => {
    if (req.session.admin_email === undefined)
        res.status(401).json({
            content: false
        })
    else {
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
                                    let searchIdeaSql = "select idea_title, idea_date from idea join member where idea.member_email = member.member_email and member.member_secede != ? and member.member_ban != ? and idea_delete != ? order by idea_id desc limit ?, ?;"
                                    let searchIdeaParam = [1, 1, 1, start, pageSize]
                                    let searchRankSql = "select member_rank, member_name, save_point from member where member_ban != ? and member_secede != ? and member_rank is not null order by member_rank asc limit ?;"
                                    let searchRankParam = [1, 1, 10]
                                    conn.query(searchRankSql, searchRankParam, function (error, rows) {
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
                                                let rankStruct = []
                                                for (let i = 0; i < rows.length; i++) {
                                                    rankStruct.push({
                                                        member_rank: rows[i].member_rank,
                                                        member_name: rows[i].member_name,
                                                        save_point: rows[i].save_point
                                                    })
                                                }
                                                conn.query(searchIdeaSql, searchIdeaParam, function (error, rows) {
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
                                                            let ideaStruct = []
                                                            for (let i = 0; i < rows.length; i++) {
                                                                ideaStruct.push({
                                                                    idea_title: rows[i].idea_title,
                                                                    idea_date: rows[i].idea_date
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
                            let searchIdeaSql = "select idea_title, idea_date from idea join member where idea.member_email = member.member_email and member.member_secede != ? and member.member_ban != ? and idea_delete != ? order by idea_id desc limit ?, ?;"
                            let searchIdeaParam = [1, 1, 1, 0, rows[0].count]
                            let searchRankSql = "select member_rank, member_name, save_point from member where member_ban != ? and member_secede != ? and member_rank is not null order by member_rank asc limit ?;"
                            let searchRankParam = [1, 1, 10]
                            conn.query(searchRankSql, searchRankParam, function (error, rows) {
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
                                        let rankStruct = []
                                        for (let i = 0; i < rows.length; i++) {
                                            rankStruct.push({
                                                member_rank: rows[i].member_rank,
                                                member_name: rows[i].member_name,
                                                save_point: rows[i].save_point
                                            })
                                        }
                                        conn.query(searchIdeaSql, searchIdeaParam, function (error, rows) {
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
                                                    let ideaStruct = []
                                                    for (let i = 0; i < rows.length; i++) {
                                                        ideaStruct.push({
                                                            idea_title: rows[i].idea_title,
                                                            idea_date: rows[i].idea_date
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

// 19. 아이디어 상세 조회(관리자)
app.get("/idea/detail", (req, res) => {
    if (req.session.admin_email === undefined || req.query.idea_id === undefined)
        res.status(401).json({
            content: false
        })
    else {
        getConnection((conn) => {
            let searchDeleteSql = "select idea_delete from idea join member where idea.member_email = member.member_email and member_secede != ? and member_ban != ? and idea_id = ?"
            let searchDeleteParam = [1, 1, req.query.idea_id]
            conn.query(searchDeleteSql, searchDeleteParam, function (error, rows) {
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
                        if (rows[0].idea_delete === 1)
                            res.status(401).json({
                                content: false
                            })
                        else {
                            let fileCheckSql = "select idea_file_name from idea_file_dir where idea_id = ?"
                            let fileCheckParam = [req.query.idea_id]
                            conn.query(fileCheckSql, fileCheckParam, function (error, rows) {
                                if (error) {
                                    console.error(error)
                                    res.status(500).json({
                                        content: "DB Error"
                                    })
                                } else {
                                    let getIdeaDetailParam = [req.query.idea_id]
                                    if (rows.length === 0) {
                                        let getIdeaDetailSql = "select idea_title, idea_contents, idea_date, member.member_name from idea join member where idea.member_email = member.member_email and idea_id = ?;"
                                        conn.query(getIdeaDetailSql, getIdeaDetailParam, function (error, rows) {
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
                                                    let ideaDetailStruct = []
                                                    ideaDetailStruct.push({
                                                        idea_title: rows[0].idea_title,
                                                        idea_contents: rows[0].idea_contents,
                                                        idea_date: rows[0].idea_date,
                                                        member_name: rows[0].member_name
                                                    })
                                                    res.status(200).json({
                                                        ideaDetailStruct
                                                    })
                                                }
                                            }
                                        })
                                    } else {
                                        let getIdeaDetailSql = "select idea_title, idea_contents, idea_date, member.member_name, idea_file_dir.idea_file_name from idea join member join idea_file_dir where idea.member_email = member.member_email and idea.idea_id = idea_file_dir.idea_id and idea.idea_id = ?;"
                                        conn.query(getIdeaDetailSql, getIdeaDetailParam, function (error, rows) {
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
                                                    let ideaDetailStruct = []
                                                    for (let i = 0; i < rows.length; i++) {
                                                        ideaDetailStruct.push({
                                                            idea_title: rows[i].idea_title,
                                                            idea_contents: rows[i].idea_contents,
                                                            idea_date: rows[i].idea_date,
                                                            member_name: rows[i].member_name,
                                                            file_name: rows[i].idea_file_name
                                                        })
                                                    }
                                                    res.status(200).json({
                                                        ideaDetailStruct
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

// 20. 아이디어 첨부파일 다운로드(관리자)
app.post("/idea/download", (req, res) => {
    if (req.session.admin_email === undefined || req.body.idea_id === undefined || req.body.idea_file_name === undefined)
        res.status(401).json({
            content: false
        })
    else {
        getConnection((conn) => {
            let searchDeleteSql = "select idea_delete from idea join member where idea.member_email = member.member_email and member_secede != ? and member_ban != ? and idea_id = ?"
            let searchDeleteParam = [1, 1, req.body.idea_id]
            conn.query(searchDeleteSql, searchDeleteParam, function (error, rows) {
                if (error) {
                    console.error(error)
                    res.status(500).json({
                        content: false
                    })
                } else {
                    if (rows.length === 0)
                        res.status(401).json({
                            content: false
                        })
                    else {
                        if (rows[0].idea_delete === 1)
                            res.status(401).json({
                                content: false
                            })
                        else {
                            let fileCheckSql = "select idea_file_path from idea_file_dir where idea_file_name = ? and idea_id = ?;"
                            let fileCheckParam = [req.body.idea_file_name, req.body.idea_id]
                            conn.query(fileCheckSql, fileCheckParam, function (error, rows) {
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

// 21. 아이디어 검색(관리자)
app.get("/idea/search-title", (req, res) => {
    if (req.session.admin_email === undefined || req.query.idea_title === undefined)
        res.status(401).json({
            content: false
        })
    else {
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
                                    let searchIdeaSql = "select idea_title, idea_date\n" +
                                        "from idea join member\n" +
                                        "where match(idea_title) against(? in boolean mode) and idea_delete != ? and idea.member_email = member.member_email and member.member_secede != ? and member.member_ban != ? order by idea_id desc limit ?, ?;"
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
                                                    ideaStruct.push({
                                                        idea_title: rows[i].idea_title,
                                                        idea_date: rows[i].idea_date
                                                    })
                                                }
                                                res.status(200).json({
                                                    ideaStruct
                                                })
                                            }
                                        }
                                    })
                                }
                            }
                        } else {
                            let searchIdeaSql = "select idea_title, idea_date\n" +
                                "from idea join member\n" +
                                "where match(idea_title) against(? in boolean mode) and idea_delete != ? and idea.member_email = member.member_email and member.member_secede != ? and member.member_ban != ? order by idea_id desc limit ?, ?;"
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
                                            ideaStruct.push({
                                                idea_title: rows[i].idea_title,
                                                idea_date: rows[i].idea_date
                                            })
                                        }
                                        res.status(200).json({
                                            ideaStruct
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

// 22. 문의글 조회(관리자)
app.get("/cs/list", (req, res) => {
    if (req.session.admin_email === undefined)
        res.status(401).json({
            content: false
        })
    else {
        getConnection((conn) => {
            let getCountSql = "select count(*) as count from cs join member on cs.member_email = member.member_email where member_secede != ? and member_ban != ? and cs_delete != ?;"
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
                                    let searchCsSql = "select cs_title, member.member_name, cs_date, cs_secret, admin.admin_name, cs_resp_date from cs left join member on cs.member_email = member.member_email left join admin on cs.admin_email = admin.admin_email where cs_delete != ? and member.member_ban != ? and member.member_secede != ? order by cs_id desc limit ?, ?;"
                                    let searchCsParam = [1, 1, 1, start, pageSize]
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
                                    if (rows.length === 0)
                                        res.status(401).json({
                                            content: false
                                        })
                                    else {
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

// 23. 문의글 상세 조회(관리자)
app.get("/cs/detail", (req, res) => {
    if (req.session.admin_email === undefined || req.query.cs_id === undefined)
        res.status(401).json({
            content: false
        })
    else {
        getConnection((conn) => {
            let searchDeleteSql = "select cs_delete from cs join member where cs.member_email = member.member_email and member_secede != ? and member_ban != ? and cs_id = ?"
            let searchDeleteParam = [1, 1, req.query.cs_id]
            conn.query(searchDeleteSql, searchDeleteParam, function (error, rows) {
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
                        if (rows[0].cs_delete === 1)
                            res.status(401).json({
                                content: false
                            })
                        else {
                            let fileCheckSql = "select cs_file_name from cs_file_dir where cs_id = ?"
                            let fileCheckParam = [req.query.cs_id]
                            conn.query(fileCheckSql, fileCheckParam, function (error, rows) {
                                if (error) {
                                    console.error(error)
                                    res.status(500).json({
                                        content: "DB Error"
                                    })
                                } else {
                                    let getCsDetailParam = [req.query.cs_id]
                                    if (rows.length === 0) {
                                        let getCsDetailSql = "select cs_title, cs_contents, cs_date, member.member_name from cs join member where cs.member_email = member.member_email and cs_id = ?;"
                                        conn.query(getCsDetailSql, getCsDetailParam, function (error, rows) {
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
                                                    let csDetailStruct = []
                                                    csDetailStruct.push({
                                                        cs_title: rows[0].cs_title,
                                                        cs_contents: rows[0].cs_contents,
                                                        cs_date: rows[0].cs_date,
                                                        member_name: rows[0].member_name
                                                    })
                                                    res.status(200).json({
                                                        csDetailStruct
                                                    })
                                                }
                                            }
                                        })
                                    } else {
                                        let getCsDetailSql = "select cs_title, cs_contents, cs_date, member.member_name, cs_file_dir.cs_file_name from cs join member join cs_file_dir where cs.member_email = member.member_email and cs.cs_id = cs_file_dir.cs_id and cs.cs_id = ?;"
                                        conn.query(getCsDetailSql, getCsDetailParam, function (error, rows) {
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
                                                    let csDetailStruct = []
                                                    for (let i = 0; i < rows.length; i++) {
                                                        csDetailStruct.push({
                                                            cs_title: rows[i].cs_title,
                                                            cs_contents: rows[i].cs_contents,
                                                            cs_date: rows[i].cs_date,
                                                            member_name: rows[i].member_name,
                                                            file_name: rows[i].cs_file_name
                                                        })
                                                    }

                                                    res.status(200).json({
                                                        csDetailStruct
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

// 24. 문의글 답변 상세 조회(관리자)
app.get("/cs/resp/detail", (req, res) => {
    if (req.session.admin_email === undefined || req.query.cs_id === undefined)
        res.status(401).json({
            content: false
        })
    else {
        getConnection((conn) => {
            let searchRespDetailSql = "select cs_title, admin.admin_name, cs_resp_date, cs_resp from cs left join member on cs.member_email = member.member_email left join admin on cs.admin_email = admin.admin_email where cs_delete != ? and member.member_ban != ? and member.member_secede != ? and cs_id = ?"
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
                            let csRespDetailStruct = {
                                cs_resp_title: "RE : " + rows[0].cs_title,
                                admin_name: rows[0].admin_name,
                                cs_resp_date: rows[0].cs_resp_date,
                                cs_resp: rows[0].cs_resp
                            }
                            res.status(200).json({
                                csRespDetailStruct
                            })
                        }
                    }
                }
                conn.release()
            })
        })
    }
})

// 25. 문의글 첨부파일 다운로드(관리자)
app.post("/cs/download", (req, res) => {
    if (req.session.admin_email === undefined || req.body.cs_id === undefined || req.body.cs_file_name === undefined)
        res.status(401).json({
            content: false
        })
    else {
        getConnection((conn) => {
            let searchDeleteSql = "select cs_delete from cs join member where cs.member_email = member.member_email and member_secede != ? and member_ban != ? and cs_id = ?"
            let searchDeleteParam = [1, 1, req.body.cs_id]
            conn.query(searchDeleteSql, searchDeleteParam, function (error, rows) {
                if (error) {
                    console.error(error)
                    res.status(500).json({
                        content: false
                    })
                } else {
                    if (rows.length === 0)
                        res.status(401).json({
                            content: false
                        })
                    else {
                        if (rows[0].cs_delete === 1)
                            res.status(401).json({
                                content: false
                            })
                        else {
                            let fileCheckSql = "select cs_file_path from cs_file_dir where cs_file_name = ? and cs_id = ?"
                            let fileCheckParam = [req.body.cs_file_name, req.body.cs_id]
                            conn.query(fileCheckSql, fileCheckParam, function (error, rows) {
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
                            })
                        }
                    }
                }
                conn.release()
            })
        })
    }
})

// 26. 문의글 검색(관리자)
app.get("/cs/search-title", (req, res) => {
    if (req.session.admin_email === undefined || req.query.cs_title === undefined)
        res.status(401).json({
            content: false
        })
    else {
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

// 27. 공고정보 조회(관리자)
app.get("/anno/list", (req, res) => {
    if (req.session.admin_email === undefined)
        res.status(401).json({
            content: false
        })
    else {
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
                                    let searchAnnoSql = "select anno_flag, anno_title, anno_date from anno order by anno_flag DESC limit ?, ?"
                                    let searchAnnoParam = [start, pageSize]
                                    conn.query(searchAnnoSql, searchAnnoParam, function (error, rows) {
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
                                                let annoStruct = []
                                                for (let i = 0; i < rows.length; i++) {
                                                    annoStruct.push({
                                                        anno_flag: rows[i].anno_flag,
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
                            let searchAnnoSql = "select anno_flag, anno_title, anno_date from anno order by anno_flag DESC limit ?, ?"
                            let searchAnnoParam = [0, rows[0].count]
                            conn.query(searchAnnoSql, searchAnnoParam, function (error, rows) {
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
                                        let annoStruct = []
                                        for (let i = 0; i < rows.length; i++) {
                                            annoStruct.push({
                                                anno_flag: rows[i].anno_flag,
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

// 28. 공고정보 상세 조회(관리자)
app.get("/anno/list/detail", (req, res) => {
    if (req.session.admin_email === undefined || req.query.bid === undefined)
        res.status(401).json({
            content: false
        })
    else {
        let bid = req.query.bid
        let searchDetailAnnoSql = "select anno_ref, anno_link, anno_contents from anno where anno_flag = ?"
        let searchDetailAnnoParam = [bid]
        getConnection((conn) => {
            conn.query(searchDetailAnnoSql, searchDetailAnnoParam, function (error, rows) {
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
                            ref: rows[0].anno_ref,
                            link: rows[0].anno_link,
                            content: rows[0].anno_contents
                        })
                    }
                }
            })
            conn.release()
        })
    }
})

// 29. 공고정보 검색(관리자)
app.get("/anno/search-title", (req, res) => {
    if (req.session.admin_email === undefined || req.query.anno_title === undefined)
        res.status(401).json({
            content: false
        })
    else {
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
                                        "where match(anno_title) against(? in boolean mode) order by anno_id desc limit ?, ?;"
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
                                "where match(anno_title) against(? in boolean mode) order by anno_id desc limit ?, ?;"
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

// 30. 공지사항 조회(관리자)
app.get("/notice/list", (req, res) => {
    if (req.session.admin_email === undefined)
        res.status(401).json({
            content: false
        })
    else {
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
                                            if (rows.length === 0)
                                                res.status(401).json({
                                                    content: false
                                                })
                                            else {
                                                let noticeStruct = []
                                                for (let i = 0; i < rows.length; i++) {
                                                    noticeStruct.push({
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
                                    if (rows.length === 0)
                                        res.status(401).json({
                                            content: false
                                        })
                                    else {
                                        let noticeStruct = []
                                        for (let i = 0; i < rows.length; i++) {
                                            noticeStruct.push({
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

// 31. 공지사항 상세 조회(관리자)
app.get("/notice/detail", (req, res) => {
    if (req.session.admin_email === undefined || req.query.notice_id === undefined)
        res.status(401).json({
            content: false
        })
    else {
        getConnection((conn) => {
            let searchDeleteSql = "select notice_delete from notice where notice_id = ?"
            let searchDeleteParam = [req.query.notice_id]
            conn.query(searchDeleteSql, searchDeleteParam, function (error, rows) {
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
                        if (rows[0].notice_delete === 1)
                            res.status(401).json({
                                content: false
                            })
                        else {
                            let fileCheckSql = "select notice_file_name from notice_file_dir where notice_id = ?"
                            let fileCheckParam = [req.query.notice_id]
                            conn.query(fileCheckSql, fileCheckParam, function (error, rows) {
                                if (error) {
                                    console.error(error)
                                    res.status(500).json({
                                        content: "DB Error"
                                    })
                                } else {
                                    let getNoticeDetailParam = [req.query.notice_id]
                                    if (rows.length === 0) {
                                        let getNoticeDetailSql = "select notice_title, notice_contents, notice_date, admin.admin_name from notice join admin where notice.admin_email = admin.admin_email and notice_id = ?;"
                                        conn.query(getNoticeDetailSql, getNoticeDetailParam, function (error, rows) {
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
                                                    let noticeDetailStruct = []
                                                    noticeDetailStruct.push({
                                                        notice_title: rows[0].notice_title,
                                                        notice_contents: rows[0].notice_contents,
                                                        notice_date: rows[0].notice_date,
                                                        admin_name: rows[0].admin_name
                                                    })
                                                    res.status(200).json({
                                                        noticeDetailStruct
                                                    })
                                                }
                                            }
                                        })
                                    } else {
                                        let getNoticeDetailSql = "select notice_title, notice_contents, notice_date, admin.admin_name, notice_file_dir.notice_file_name from notice join admin join notice_file_dir where notice.admin_email = admin.admin_email and notice.notice_id = notice_file_dir.notice_id and notice.notice_id = ?;"
                                        conn.query(getNoticeDetailSql, getNoticeDetailParam, function (error, rows) {
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
                                                    let noticeDetailStruct = []
                                                    for (let i = 0; i < rows.length; i++) {
                                                        noticeDetailStruct.push({
                                                            notice_title: rows[i].notice_title,
                                                            notice_contents: rows[i].notice_contents,
                                                            notice_date: rows[i].notice_date,
                                                            admin_name: rows[i].admin_name,
                                                            file_name: rows[i].notice_file_name
                                                        })
                                                    }

                                                    res.status(200).json({
                                                        noticeDetailStruct
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

// 32. 공지사항 첨부파일 다운로드(관리자)
app.post("/notice/download", (req, res) => {
    if (req.session.admin_email === undefined || req.body.notice_id === undefined || req.body.notice_file_name === undefined)
        res.status(401).json({
            content: false
        })
    else {
        getConnection((conn) => {
            let searchDeleteSql = "select notice_delete from notice where notice_id = ?"
            let searchDeleteParam = [req.body.notice_id]
            conn.query(searchDeleteSql, searchDeleteParam, function (error, rows) {
                if (error) {
                    console.error(error)
                    res.status(500).json({
                        content: false
                    })
                } else {
                    if (rows.length === 0)
                        res.status(401).json({
                            content: false
                        })
                    else {
                        if (rows[0].notice_delete === 1)
                            res.status(401).json({
                                content: false
                            })
                        else {
                            let fileCheckSql = "select notice_file_path from notice_file_dir where notice_file_name = ? and notice_id = ?"
                            let fileCheckParam = [req.body.notice_file_name, req.body.notice_id]
                            conn.query(fileCheckSql, fileCheckParam, function (error, rows) {
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
                            })
                        }
                    }
                }
                conn.release()
            })
        })
    }
})

// 33. 공지사항 검색(관리자)
app.get("/notice/search-title", (req, res) => {
    if (req.session.admin_email === undefined || req.query.notice_title === undefined)
        res.status(401).json({
            content: false
        })
    else {
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
                                        "where match(notice_title) against(? in boolean mode) and notice_delete != ? order by notice_id desc limit ?, ?;"
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
                                "where match(notice_title) against(? in boolean mode) and notice_delete != ? order by notice_id desc limit ?, ?;"
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

// 34. 고객센터 관련 정보 조회
app.get("/contact/list", (req, res) => {
    if (req.session.admin_email === undefined)
        res.status(401).json({
            content: false
        })
    else {
        getConnection((conn) => {
            let getCountSql = "select count(*) as count from contact;"
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
                                    let searchContactSql = "select contact_title, contact_log.contact_send from contact join contact_log where contact.contact_id = contact_log.contact_id order by contact.contact_id desc limit ?, ?;"
                                    let searchContactParam = [start, pageSize]
                                    conn.query(searchContactSql, searchContactParam, function (error, rows) {
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
                                                let contactStruct = []
                                                for (let i = 0; i < rows.length; i++) {
                                                    contactStruct.push({
                                                        contact_title: rows[i].contact_title,
                                                        contact_date: rows[i].notice_date
                                                    })
                                                }
                                                res.status(200).json({
                                                    contactStruct
                                                })
                                            }
                                        }
                                    })
                                }
                            }
                        } else {
                            let searchContactSql = "select contact_title, contact_log.contact_send from contact join contact_log where contact.contact_id = contact_log.contact_id order by contact.contact_id desc limit ?, ?;"
                            let searchContactParam = [0, rows[0].count]
                            conn.query(searchContactSql, searchContactParam, function (error, rows) {
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
                                        let contactStruct = []
                                        for (let i = 0; i < rows.length; i++) {
                                            contactStruct.push({
                                                contact_title: rows[i].contact_title,
                                                contact_date: rows[i].notice_date
                                            })
                                        }
                                        res.status(200).json({
                                            contactStruct
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

// 35. 고객센터 관련 정보 상세 조회
app.get("/contact/detail", (req, res) => {
    if (req.session.admin_email === undefined || req.query.contact_id === undefined)
        res.status(401).json({
            content: false
        })
    else {
        getConnection((conn) => {
            let searchContactSql = "select email, contact_title, contact_contents, contact_log.contact_send from contact join contact_log where contact.contact_id = contact_log.contact_id and contact.contact_id = ?"
            let searchContactParam = [req.query.contact_id]
            conn.query(searchContactSql, searchContactParam, function (error, rows) {
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
                        let contactStruct = []
                        contactStruct.push({
                            email: rows[0].email,
                            contact_title: rows[0].contact_title,
                            contact_contents: rows[0].contact_contents,
                            contact_send: rows[0].contact_send
                        })
                        res.status(200).json({
                            contactStruct
                        })
                    }
                }
                conn.release()
            })
        })
    }
})

// 36. 고객센터 답변
app.post("/contact/resp", (req, res) => {
    if (req.session.admin_email === undefined || req.body.contact_id === undefined || req.body.contact_resp_title === undefined || req.body.contact_resp_contents === undefined)
        res.status(401).json({
            content: false
        })
    else {
        getConnection((conn) => {
            let searchContactSql = "select email from contact where contact_id = ?"
            let searchContactParam = [req.body.contact_id]
            conn.query(searchContactSql, searchContactParam, function (error, rows) {
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
                        let senderEmail = rows[0].email
                        func.sendEmail(senderEmail, req.body.contact_resp_contents, req.body.contact_resp_title).then(mailContents => {
                            transporter.sendMail(mailContents, function (error, info) {
                                if (error)
                                    res.status(500).json({
                                        content: "Mail Error"
                                    })
                                else
                                    console.log(info.response)
                            })
                        })
                        let updateContactRespSql = "update contact_log set contact_response = ?, admin_email = ? where contact_id = ?"
                        let updateContactRespParam = [moment(new Date()).format("YYYY-MM-DD HH:mm:ss"), req.session.admin_email, req.body.contact_id]
                        conn.query(updateContactRespSql, updateContactRespParam, function (error) {
                            if (error) {
                                console.error(error)
                                res.status(500).json({
                                    content: "DB Error"
                                })
                            } else {
                                console.log("Success Contact Response Update.")
                                res.status(200).json({
                                    content: true
                                })
                            }
                        })
                    }
                }
                conn.release()
            })
        })
    }
})

// 37. 포인트 현황 조회(관리자)
app.post("/point/now", (req, res) => {
    if (req.session.admin_email === undefined || req.body.member_email === undefined) {
        res.status(401).json({
            content: false
        })
    } else {
        getConnection((conn) => {
            let adminCheckSql = "select admin_secede from admin where admin_email = ?;"
            let adminCheckParam = [req.session.admin_email]
            conn.query(adminCheckSql, adminCheckParam, function (error, rows) {
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
                        if (rows[0].admin_secede === 1)
                            res.status(401).json({
                                content: false
                            })
                        else {
                            let memberCheckSql = "select member_ban, member_secede from member where member_email = ?;"
                            let memberCheckParam = [req.body.member_email]
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
                                            let searchPointSql = "select member_email, member_name, member_rank, member_point, save_point, use_point from member where member_email = ?;"
                                            let searchPointParam = [req.body.member_email]
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
                                                            member_email: rows[0].member_email,
                                                            member_name: rows[0].member_name,
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
                            })
                        }
                    }
                }
                conn.release()
            })
        })
    }
})

// 38. 포인트 사용내역 조회(관리자)
app.post("/point/use-history", (req, res) => {
    if (req.session.admin_email === undefined || req.body.member_email === undefined)
        res.status(401).json({
            content: false
        })
    else {
        getConnection((conn) => {
            let adminCheckSql = "select admin_secede from admin where admin_email = ?;"
            let adminCheckParam = [req.session.admin_email]
            conn.query(adminCheckSql, adminCheckParam, function (error, rows) {
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
                        if (rows[0].admin_secede === 1)
                            res.status(401).json({
                                content: false
                            })
                        else {
                            let memberCheckSql = "select member_email, member_name, member_ban, member_secede from member where member_email = ?;"
                            let memberCheckParam = [req.body.member_email]
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
                                            let memberEmail = rows[0].member_email
                                            let memberName = rows[0].member_name
                                            let getCountSql = "select count(*) as count from point where member_email = ?;"
                                            let getCountParam = [memberEmail]
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
                                                            if (req.body.page === undefined || req.body.page === "")
                                                                res.status(401).json({
                                                                    content: "empty page number"
                                                                })
                                                            else {
                                                                let page = req.body.page
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
                                                                    let searchPointSql = "select use_contents, point, use_date, accept_flag, use_code from point where member_email = ? limit ?, ?;"
                                                                    let searchPointParam = [req.body.member_email, start, pageSize]
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
                                                                                    if (rows[i].accept_flag === null) {
                                                                                        pointInfoStruct.push({
                                                                                            member_email: memberEmail,
                                                                                            member_name: memberName,
                                                                                            use_contents: rows[i].use_contents,
                                                                                            point: rows[i].point,
                                                                                            use_date: rows[i].use_date,
                                                                                        })
                                                                                    } else {
                                                                                        pointInfoStruct.push({
                                                                                            member_email: memberEmail,
                                                                                            member_name: memberName,
                                                                                            use_contents: rows[i].use_contents,
                                                                                            point: rows[i].point,
                                                                                            use_date: rows[i].use_date,
                                                                                            accept_flag: rows[i].accept_flag,
                                                                                            use_code: rows[i].use_code
                                                                                        })
                                                                                    }
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
                                                            let searchPointSql = "select use_contents, point, use_date, accept_flag, use_code from point where member_email = ? limit ?, ?;"
                                                            let searchPointParam = [req.body.member_email, 0, rows[0].count]
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
                                                                            if (rows[i].accept_flag === null) {
                                                                                pointInfoStruct.push({
                                                                                    member_email: memberEmail,
                                                                                    member_name: memberName,
                                                                                    use_contents: rows[i].use_contents,
                                                                                    point: rows[i].point,
                                                                                    use_date: rows[i].use_date,
                                                                                })
                                                                            } else {
                                                                                pointInfoStruct.push({
                                                                                    member_email: memberEmail,
                                                                                    member_name: memberName,
                                                                                    use_contents: rows[i].use_contents,
                                                                                    point: rows[i].point,
                                                                                    use_date: rows[i].use_date,
                                                                                    accept_flag: rows[i].accept_flag,
                                                                                    use_code: rows[i].use_code
                                                                                })
                                                                            }
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
                            })
                        }
                    }
                }
                conn.release()
            })
        })
    }
})

// 39. 포인트 적립내역 조회(관리자)
app.post("/point/point-history", (req, res) => {
    if (req.session.admin_email === undefined || req.body.member_email === undefined)
        res.status(401).json({
            content: false
        })
    else {
        getConnection((conn) => {
            let adminCheckSql = "select admin_secede from admin where admin_email = ?;"
            let adminCheckParam = [req.session.admin_email]
            conn.query(adminCheckSql, adminCheckParam, function (error, rows) {
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
                        if (rows[0].admin_secede === 1)
                            res.status(401).json({
                                content: false
                            })
                        else {
                            let memberCheckSql = "select member_email, member_name, member_ban, member_secede from member where member_email = ?;"
                            let memberCheckParam = [req.body.member_email]
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
                                            let memberEmail = rows[0].member_email
                                            let memberName = rows[0].member_name
                                            let getCountSql = "select count(*) as count from idea where member_email = ? and idea_delete != ?;"
                                            let getCountParam = [memberEmail, 1]
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
                                                            if (req.body.page === undefined || req.body.page === "")
                                                                res.status(401).json({
                                                                    content: "empty page number"
                                                                })
                                                            else {
                                                                let page = req.body.page
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
                                                                    let searchIdeaPointParam = [req.body.member_email, 1, start, pageSize]
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
                                                                                            member_email: memberEmail,
                                                                                            member_name: memberName,
                                                                                            idea_title: rows[i].idea_title,
                                                                                            add_point: rows[i].add_point,
                                                                                            date_point: rows[i].idea_date
                                                                                        })
                                                                                    } else {
                                                                                        ideaPointStruct.push({
                                                                                            member_email: memberEmail,
                                                                                            member_name: memberName,
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
                                                            let searchIdeaPointParam = [req.body.member_email, 1, 0, rows[0].count]
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
                                                                                    member_email: memberEmail,
                                                                                    member_name: memberName,
                                                                                    idea_title: rows[i].idea_title,
                                                                                    add_point: rows[i].add_point,
                                                                                    date_point: rows[i].idea_date
                                                                                })
                                                                            } else {
                                                                                ideaPointStruct.push({
                                                                                    member_email: memberEmail,
                                                                                    member_name: memberName,
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
                            })
                        }
                    }
                }
                conn.release()
            })
        })
    }
})

// 40. 포인트 사용 수락(관리자)
app.patch("/point/use-point", (req, res) => {
    if (req.session.admin_email === undefined || req.body.use_point === undefined || req.body.use_code === undefined)
        res.status(401).json({
            content: false
        })
    else {
        getConnection((conn) => {
            let adminCheckSql = "select admin_secede from admin where admin_email = ?;"
            let adminCheckParam = [req.session.admin_email]
            conn.query(adminCheckSql, adminCheckParam, function (error, rows) {
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
                        if (rows[0].admin_secede === 1)
                            res.status(401).json({
                                content: false
                            })
                        else {
                            let memberCheckSql = "select member_ban, member_secede, save_point, use_point, member_email, member_point from member where member_email = (select member_email from point where use_code = ?)"
                            let memberCheckParam = [req.body.use_code]
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
                                            if (rows[0].member_point < req.body.use_point) {
                                                res.status(401).json({
                                                    content: false
                                                })
                                            } else {
                                                let updatePointSql = "update point set use_date = " + conn.escape(moment(new Date()).format("YYYY-MM-DD")) + ", accept_flag = " + conn.escape(1) +
                                                    ", admin_email = " + conn.escape(req.session.admin_email) + " where use_code = " + conn.escape(req.body.use_code) +
                                                    " and accept_flag is not null and accept_flag != " + conn.escape(1) + ";"
                                                updatePointSql += "update member set member_point = " + conn.escape(rows[0].save_point - (rows[0].use_point + req.body.use_point)) +
                                                    ", use_point = " + conn.escape(rows[0].use_point + req.body.use_point) + " where member_email = " + conn.escape(rows[0].member_email) + ";"
                                                conn.query(updatePointSql, function (error) {
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