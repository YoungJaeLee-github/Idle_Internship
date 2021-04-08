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

app.use(sessionConfig.init())

/**
 * --------------------------------------------------------------------------------------------------------
 * Rank Scheduler
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
        conn.query(searchPointSql, searchPointParam, function (error, rows, fields) {
            if (error) {
                console.error(error)
            } else {
                if (rows.length === 0)
                    console.error(error)
                else {
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

                    let updateRankSql = ""
                    for (let i = 0; i < structForRank.length; i++)
                        updateRankSql += "update member set member_rank = " + conn.escape(structForRank[i].member_rank) + " where member_email = " + conn.escape(structForRank[i].member_email) + ";"
                    updateRankSql += "update member set member_rank = " + conn.escape(null) + " where member_ban = " + conn.escape(1) + " or member_secede = " + conn.escape(1) + ";"

                    conn.query(updateRankSql, function (error, rows, fields) {
                        if (error) {
                            console.error(error)
                        } else {
                            console.log("Success Rank update.")
                        }
                    })
                }
            }
            conn.release()
        })
    })
})

/**
 * --------------------------------------------------------------------------------------------------------
 * crawling
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
            let insertSql = ""
            for (let i = 0; i < data.length; i++) {
                let bid = data[i].link.split("&")[8].split("=")[1]
                insertSql += "insert into anno(anno_title, anno_contents, anno_date, anno_link, anno_ref, anno_flag) select " + conn.escape(data[i].title) + ", " +
                    conn.escape(' ') + ", " + conn.escape(data[i].date) + ", " + conn.escape(data[i].link) + ", " + conn.escape('강원대학교 컴퓨터공학과') + ", " + conn.escape(bid * 1) +
                    " from dual where not exists(select * from anno where anno_flag = " + conn.escape(bid * 1) + ");"
            }
            conn.query(insertSql, function (error) {
                if (error) {
                    console.error(error)
                } else {
                    console.log("Success Crawling.")
                }
                conn.release()
            })
        })
    }).catch(error => {
        console.error(error)
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
                    console.error(error)
                } else {
                    if (rows.length === 0)
                        console.error(error)
                    else {
                        for (let i = 0; i < rows.length; i++)
                            linkList.push({
                                link: rows[i].anno_link,
                                bid: rows[i].anno_flag
                            })
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
            let temp = await page.$("#oxbbsPrintArea > div > div.note")
            contents.push({
                text: await page.evaluate((data) => {
                    return data.innerHTML
                }, temp)
            })
        }

        getConnection((conn) => {
            let updateSql = ""
            for (let i = 0; i < contents.length; i++)
                updateSql += "update anno set anno_contents = " + conn.escape(contents[i].text) + " where anno_flag = " + conn.escape(linkList[i].bid) + ";"

            conn.query(updateSql, function (error) {
                if (error) {
                    console.error(error)
                } else
                    console.log("Insert Contents Success.")
                conn.release()
            })
        })
    })
}

cron.schedule("00 00 1-31 * *", async function () {
    const browser = await puppeteer.launch({headless: false})
    const page = await browser.newPage()
    await page.setViewport({
        width: 1920,
        height: 1080
    })

    await listCrawling(page)

    await page.waitFor(5000)
    await browser.close()
})

cron.schedule("01 00 1-31 * *", async function () {
    const browser = await puppeteer.launch({headless: false})
    const page = await browser.newPage()
    await page.setViewport({
        width: 1920,
        height: 1080
    })

    await contentsCrawling(page)

    await page.waitFor(10000)
    await browser.close()
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
    if (checkEmail === undefined)
        res.status(401).send(false)
    else {
        let emailCheckSql = "select member_email, member_secede, member_ban from member where member_email = ?;"
        let selectParam = [checkEmail]
        getConnection((conn) => {
            conn.query(emailCheckSql, selectParam, function (error, rows, fields) {
                if (error) {
                    res.status(500).send("DB Error")
                } else {
                    let isEmail = rows.length === 0 ? null : rows[0].member_email
                    let value = func.emailCheck(isEmail)
                    // 중복된 이메일이 없음
                    if (value === 200)
                        res.status(200).send("empty")
                    else if (value === 401 && rows[0].member_secede === 0) {
                        // 정지되지 않은 회원.(정상적인 회원)
                        if (rows[0].member_ban === 0)
                            res.status(200).send("OK")
                        else
                            // member_ban === 1 정지된 회원
                            res.status(401).send("ban")
                    } else {
                        // 탈퇴한 회원
                        res.status(401).send("secede")
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
    if (adminEmail === undefined)
        res.status(401).send("Empty Param")
    else {
        let adminCheckSql = "select admin_email, admin_secede from admin where admin_email = ?;"
        let adminCheckParam = [adminEmail]
        getConnection((conn) => {
            conn.query(adminCheckSql, adminCheckParam, function (error, rows, fields) {
                if (error) {
                    res.status(500).send("DB Error")
                } else {
                    let isEmail = rows.length === 0 ? null : rows[0].admin_email
                    let emailCheckValue = func.emailCheck(isEmail)
                    if (emailCheckValue === 200)
                        res.status(200).send("No admin email.")
                    else if (emailCheckValue === 401 && rows[0].admin_secede === 1)
                        res.status(200).send("No admin email.")
                    else
                        res.status(401).send("Already exists admin email.")
                }
                conn.release()
            })
        })
    }
})

// 3. 관리자 등록
app.post("/signup", (req, res) => {
    if (Object.keys(req.body).length === 0)
        res.status(401).send(false)
    else {
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
        let insertLogParam = [adminEmail, new Date(), new Date()]
        getConnection((conn) => {
            conn.query(searchEmailSql, searchEmailParam, function (error, rows, fields) {
                if (error) {
                    console.error(error)
                    res.status(500).send("DB Error")
                } else {
                    let isEmail = rows.length === 0 ? null : rows[0].admin_email
                    let emailCheckValue = func.emailCheck(isEmail)
                    crypto.getSalt().then(salt => {
                        crypto.encryptByHash(adminPw, salt).then(encryptedPw => {
                            crypto.encryption(adminPhone).then(encryptedPhone => {
                                // 최초 등록
                                if (emailCheckValue === 200) {
                                    let signupSql = "insert into admin(admin_email, admin_name, admin_sex, admin_birth, admin_state, admin_pw, admin_phone, admin_secede, admin_salt) values(?, ?, ?, ?, ?, ?, ?, ?, ?);"
                                    let signupParam = [adminEmail, adminName, adminSex, adminBirth, adminState, encryptedPw, encryptedPhone, 0, salt]
                                    conn.query(signupSql, signupParam, function (error, rows, fields) {
                                        if (error) {
                                            console.error(error)
                                            res.status(500).send("DB Error")
                                        } else {
                                            console.log("admin signup success.")
                                            req.session.admin_email = adminEmail
                                            req.session.admin_pw = encryptedPw
                                            req.session.save(function (error) {
                                                if (error)
                                                    res.status(500).send("Session Error")
                                                else
                                                    // TODO 메인 페이지로 redirect
                                                    res.status(200).send(true)
                                            })
                                        }
                                    })

                                    // log
                                    conn.query(insertLogSql, insertLogParam, function (error, rows, fields) {
                                        if (error) {
                                            console.error(error)
                                            res.status(500).send("DB Error")
                                        } else {
                                            console.log("insert log success.")
                                        }
                                    })
                                } else {
                                    // 재등록.
                                    if (rows[0].admin_secede === 1) {
                                        let updateSignupSql = "update admin set admin_name = ?, admin_sex = ?, admin_birth = ?, admin_state = ?, admin_pw = ?, admin_phone = ?, admin_secede = ?, admin_salt = ? where admin_email = ?;"
                                        let updateSignupParam = [adminName, adminSex, adminBirth, adminState, encryptedPw, encryptedPhone, 0, salt, adminEmail]
                                        conn.query(updateSignupSql, updateSignupParam, function (error, rows, fields) {
                                            if (error) {
                                                res.status(500).send("DB Error")
                                            } else {
                                                console.log("admin signup(update) success.")
                                                req.session.admin_email = adminEmail
                                                req.session.admin_pw = encryptedPw
                                                req.session.save(function (error) {
                                                    if (error)
                                                        res.status(500).send("Session Error")
                                                    else
                                                        // TODO 메인 페이지로 redirect
                                                        res.status(200).send(true)
                                                })
                                            }
                                        })

                                        // log
                                        conn.query(insertLogSql, insertLogParam, function (error, rows, fields) {
                                            if (error) {
                                                console.error(error)
                                                res.status(500).send("DB Error")
                                            } else {
                                                console.log("insert log success.")
                                            }
                                        })
                                    } else {
                                        // 이미 가입 되어 있는 회원.
                                        res.status(401).send("already exists.")
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
    if (Object.keys(req.body).length === 0)
        res.status(401).send("false")
    else {
        let adminEmail = req.body.admin_email
        let adminPw = req.body.admin_pw
        let searchEmailSql = "select admin_email, admin_secede, admin_salt, admin_pw from admin where admin_email = ?;"
        let searchEmailParam = [adminEmail]
        getConnection((conn) => {
            conn.query(searchEmailSql, searchEmailParam, function (error, rows, fields) {
                if (error) {
                    console.error(error)
                    res.status(500).send("DB Error")
                } else {
                    let emailCheckValue = func.emailCheck(rows.length === 0 ? null : rows[0].admin_email)
                    if (emailCheckValue === 200)
                        res.status(401).send("Wrong Email")
                    else {
                        // 탈퇴한 관리자.
                        if (rows[0].admin_secede === 1)
                            res.status(401).send("secede admin")
                        // 정상적인 관리자.
                        else {
                            crypto.encryptByHash(adminPw, rows[0].admin_salt).then(encryptedPw => {
                                if (encryptedPw === rows[0].admin_pw) {
                                    req.session.admin_email = adminEmail
                                    req.session.admin_pw = encryptedPw
                                    req.session.save(function (error) {
                                        if (error)
                                            res.status(500).send("Session Error")
                                        else
                                            // TODO 메인페이지로
                                            res.status(200).json({
                                                "content": "Login"
                                            })
                                    })
                                    let updateLogSql = "update admin_log set admin_login_lately = ? where admin_email = ?;"
                                    let updateLogParam = [new Date(), adminEmail]
                                    conn.query(updateLogSql, updateLogParam, function (error, rows, fields) {
                                        if (error) {
                                            console.error(error)
                                            res.status(500).send("DB Error")
                                        } else {
                                            console.log("update login log success.")
                                        }
                                    })
                                } else {
                                    res.status(401).send("Wrong Password")
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
        "content": "Logout"
    })
})

// 6. 관리자 제외
app.delete("/secede", (req, res) => {
    let rootEmail = req.session.admin_email
    if (rootEmail === undefined || Object.keys(req.body).length === 0)
        res.status(401).json({
            "content": "Wrong access."
        })
    else {
        let secedeEmail = req.body.secede_email
        let rootPw = req.body.root_pw
        let searchEmailSql = "select admin_email, admin_secede from admin where admin_email = ?;"
        let searchEmailParam = [secedeEmail]
        getConnection((conn) => {
            conn.query(searchEmailSql, searchEmailParam, function (error, rows, fields) {
                if (error) {
                    console.error(error)
                    res.status(500).json({
                        "content": "DB Error"
                    })
                } else {
                    let emailCheckValue = func.emailCheck(rows.length === 0 ? null : rows[0].admin_email)
                    if (emailCheckValue === 200)
                        res.status(401).json({
                            "content": false
                        })
                    else {
                        if (rows[0].admin_secede === 1)
                            res.status(401).json({
                                "content": false
                            })
                        else {
                            let searchSaltSql = "select admin_salt from admin where admin_email = ?;"
                            let searchSaltParam = [rootEmail]
                            conn.query(searchSaltSql, searchSaltParam, function (error, rows, fields) {
                                if (error) {
                                    console.error(error)
                                    res.status(500).json({
                                        "content": "DB Error"
                                    })
                                } else {
                                    if (rows.length === 0)
                                        res.status(401).json({
                                            "content": false
                                        })
                                    else {
                                        crypto.encryptByHash(rootPw, rows[0].admin_salt).then(encryptedPw => {
                                            if (encryptedPw === req.session.admin_pw) {
                                                let updateSecedeSql = "update admin set admin_secede = ? where admin_email = ?;"
                                                let updateSecedeParam = [1, secedeEmail]
                                                conn.query(updateSecedeSql, updateSecedeParam, function (error, rows, fields) {
                                                    if (error) {
                                                        console.error(error)
                                                        res.status(500).json({
                                                            "content": "DB Error"
                                                        })
                                                    } else
                                                        res.status(200).json({
                                                            "content": true
                                                        })
                                                })
                                            } else
                                                res.status(401).json({
                                                    "content": false
                                                })
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
    if (adminEmail === undefined || Object.keys(req.body).length === 0)
        res.status(401).json({
            "content": false
        })
    else {
        let todoBanMemberEmail = req.body.member_email
        let banReason = req.body.member_ban_reason
        let adminPw = req.body.admin_pw
        let searchEmailSql = "select member_email, member_secede, member_ban from member where member_email = ?;"
        let searchEmailParam = [todoBanMemberEmail]
        getConnection((conn) => {
            conn.query(searchEmailSql, searchEmailParam, function (error, rows, fields) {
                if (error) {
                    console.error(error)
                    res.status(500).json({
                        "content": "DB Error"
                    })
                } else {
                    let emailCheckValue = func.emailCheck(rows.length === 0 ? null : rows[0].member_email)
                    if (emailCheckValue === 200)
                        res.status(401).json({
                            "content": false
                        })
                    else {
                        if (rows[0].member_secede === 1 || rows[0].member_ban === 1)
                            res.status(401).json({
                                "content": false
                            })
                        else {
                            let searchSaltSql = "select admin_salt from admin where admin_email = ?;"
                            let searchSaltParam = [adminEmail]
                            conn.query(searchSaltSql, searchSaltParam, function (error, rows, fields) {
                                if (error) {
                                    console.error(error)
                                    res.status(500).json({
                                        "content": "DB Error"
                                    })
                                } else {
                                    if (rows.length === 0)
                                        res.status(401).json({
                                            "content": false
                                        })
                                    else {
                                        crypto.encryptByHash(adminPw, rows[0].admin_salt).then(encryptedPw => {
                                            if (encryptedPw === req.session.admin_pw) {
                                                let searchBanEmailSql = "select member_email from member_ban where member_email = ?"
                                                let searchBanEmailParam = [todoBanMemberEmail]
                                                let updateBanSql = "update member set member_ban = ? where member_email = ?"
                                                let updateBanParam = [1, todoBanMemberEmail]
                                                conn.query(searchBanEmailSql, searchBanEmailParam, function (error, rows, fields) {
                                                    if (error) {
                                                        console.error(error)
                                                        res.status(500).json({
                                                            "content": "DB Error"
                                                        })
                                                    } else {
                                                        let emailCheckValue = func.emailCheck(rows.length === 0 ? null : rows[0].member_email)
                                                        // 처음 정지 될 때
                                                        if (emailCheckValue === 200) {
                                                            let insertBanSql = "insert into member_ban(member_email, member_ban_reason, member_ban_date, admin_email) values(?, ? ,?, ?);"
                                                            let insertBanParam = [todoBanMemberEmail, banReason, new Date(), adminEmail]
                                                            conn.query(insertBanSql, insertBanParam, function (error, rows, fields) {
                                                                if (error) {
                                                                    console.error(error)
                                                                    res.status(500).json({
                                                                        "content": "DB Error"
                                                                    })
                                                                } else {
                                                                    console.log("insert ban success.")
                                                                }
                                                            })
                                                        } else {
                                                            // 정지 해제 후 다시 정지 될 때
                                                            let updateReBanSql = "update member_ban set member_ban_reason = ?, member_ban_date = ?, admin_email = ? where member_email = ?;"
                                                            let updateReBanParam = [banReason, new Date(), adminEmail, todoBanMemberEmail]
                                                            conn.query(updateReBanSql, updateReBanParam, function (error, rows, fields) {
                                                                if (error) {
                                                                    console.error(error)
                                                                    res.status(500).json({
                                                                        "content": "DB Error"
                                                                    })
                                                                } else {
                                                                    console.log("update ban success.")
                                                                }
                                                            })
                                                        }
                                                    }
                                                })

                                                conn.query(updateBanSql, updateBanParam, function (error, rows, fields) {
                                                    if (error) {
                                                        console.error(error)
                                                        res.status(500).json({
                                                            "content": "DB Error"
                                                        })
                                                    } else {
                                                        res.status(200).json({
                                                            "content": true
                                                        })
                                                    }
                                                })
                                            } else
                                                res.status(401).json({
                                                    "content": false
                                                })
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
    if (adminEmail === undefined || Object.keys(req.body).length === 0)
        res.status(401).json({
            "content": false
        })
    else {
        let todoReleaseEmail = req.body.member_email
        let releaseReason = req.body.member_ban_reason
        let adminPw = req.body.admin_pw
        let searchEmailSql = "select member_email, member_secede, member_ban from member where member_email = ?;"
        let searchEmailParam = [todoReleaseEmail]
        getConnection((conn) => {
            conn.query(searchEmailSql, searchEmailParam, function (error, rows, fields) {
                if (error) {
                    console.error(error)
                    res.status(500).json({
                        "content": "DB Error"
                    })
                } else {
                    let emailCheckValue = func.emailCheck(rows.length === 0 ? null : rows[0].member_email)
                    if (emailCheckValue === 200)
                        res.status(401).json({
                            "content": false
                        })
                    else {
                        if (rows[0].member_secede === 1 || rows[0].member_ban === 0)
                            res.status(401).json({
                                "content": false
                            })
                        else {
                            let searchSaltSql = "select admin_salt from admin where admin_email = ?;"
                            let searchSaltParam = [adminEmail]
                            conn.query(searchSaltSql, searchSaltParam, function (error, rows, fields) {
                                if (error) {
                                    console.error(error)
                                    res.status(500).json({
                                        "content": "DB Error"
                                    })
                                } else {
                                    if (rows.length === 0)
                                        res.status(401).json({
                                            "content": false
                                        })
                                    else {
                                        crypto.encryptByHash(adminPw, rows[0].admin_salt).then(encryptedPw => {
                                            if (encryptedPw === req.session.admin_pw) {
                                                let updateBanLogSql = "update member_ban set member_ban_reason = ?, member_ban_date = ?, admin_email = ? where member_email = ?;"
                                                let updateBanLogParam = [releaseReason, new Date(), adminEmail, todoReleaseEmail]
                                                let updateBanSql = "update member set member_ban = ? where member_email = ?"
                                                let updateBanParam = [0, todoReleaseEmail]

                                                conn.query(updateBanLogSql, updateBanLogParam, function (error, rows, fields) {
                                                    if (error) {
                                                        console.error(error)
                                                        res.status(500).json({
                                                            "content": "DB Error"
                                                        })
                                                    } else
                                                        console.log("Release Ban Success.")
                                                })

                                                conn.query(updateBanSql, updateBanParam, function (error, rows, fields) {
                                                    if (error) {
                                                        console.error(error)
                                                        res.status(500).json({
                                                            "content": "DB Error"
                                                        })
                                                    } else
                                                        res.status(200).json({
                                                            "content": true
                                                        })
                                                })
                                            } else
                                                res.status(401).json({
                                                    "content": false
                                                })
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
    let ideaTitle = req.body.idea_title
    if (ideaTitle === undefined || req.session.admin_email === undefined)
        res.status(401).json({
            "content": false
        })
    else {
        let searchIdeaSql = "select idea_title, idea_delete from idea where idea_title = ?;"
        let searchIdeaParam = [ideaTitle]
        let updateIdeaSql = "update idea set idea_delete = ?, admin_email = ? where idea_title = ?;"
        let updateIdeaParam = [1, req.session.admin_email, ideaTitle]
        getConnection((conn) => {
            conn.query(searchIdeaSql, searchIdeaParam, function (error, rows, fields) {
                if (error) {
                    console.error(error)
                    res.status(500).json({
                        "content": "DB Error"
                    })
                } else {
                    if (rows.length === 0)
                        res.status(401).json({
                            "content": false
                        })
                    else {
                        if (rows[0].idea_delete === 1)
                            res.status(401).json({
                                "content": false
                            })
                        else {
                            conn.query(updateIdeaSql, updateIdeaParam, function (error, rows, fields) {
                                if (error) {
                                    console.error(error)
                                    res.status(500).json({
                                        "content": "DB Error"
                                    })
                                } else {
                                    console.log("success remove idea.")
                                    res.status(200).json({
                                        "content": true
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

// 10. 포인트 부여
app.patch("/point/give", (req, res) => {
    if (req.session.admin_email === undefined || Object.keys(req.body).length === 0)
        res.status(401).json({
            "content": false
        })
    else {
        let ideaId = req.body.idea_id
        let givePoint = req.body.add_point
        let searchIdeaSql = "select idea_id, idea_delete, add_point from idea where idea_id = ?"
        let searchIdeaParam = [ideaId]
        getConnection((conn) => {
            conn.query(searchIdeaSql, searchIdeaParam, function (error, rows, fields) {
                if (error) {
                    console.error(error)
                    res.status(500).json({
                        "content": "DB Error"
                    })
                } else {
                    if (rows.length === 0)
                        res.status(401).json({
                            "content": false
                        })
                    else {
                        if (rows[0].idea_delete === 1)
                            res.status(401).json({
                                "content": false
                            })
                        else {
                            let originalPoint = rows[0].add_point
                            let selectPointSql = "select save_point, use_point, member_ban, member_secede from member where member_email = (select member_email from idea where idea_id = ?)"
                            let selectPointParam = [ideaId]
                            conn.query(selectPointSql, selectPointParam, function (error, rows, fields) {
                                if (error) {
                                    console.error(error)
                                    res.status(500).json({
                                        "content": "DB Error"
                                    })
                                } else {
                                    if (rows.length === 0)
                                        res.status(401).json({
                                            "content": false
                                        })
                                    else {
                                        if (rows[0].member_secede === 1 || rows[0].member_ban === 1)
                                            res.status(401).json({
                                                "content": false
                                            })
                                        else {
                                            let updateIdeaPointSql = "update idea set admin_email = ?, add_point = ?, date_point = ? where idea_id = ?"
                                            let updateIdeaPointParam = [req.session.admin_email, givePoint + originalPoint, new Date(), ideaId]
                                            conn.query(updateIdeaPointSql, updateIdeaPointParam, function (error, rows, fields) {
                                                if (error) {
                                                    console.error(error)
                                                    res.status(500).json({
                                                        "content": "DB Error"
                                                    })
                                                } else
                                                    console.log("Success give point.")
                                            })

                                            let updatePointSql = "update member set member_point = ?, save_point = ? where member_email = (select member_email from idea where idea_id = ?)"
                                            let todoAddSavePoint = rows[0].save_point + givePoint
                                            let todoAddMemberPoint = todoAddSavePoint - rows[0].use_point
                                            let updatePointParam = [todoAddMemberPoint, todoAddSavePoint, ideaId]
                                            conn.query(updatePointSql, updatePointParam, function (error, rows, fields) {
                                                if (error) {
                                                    console.error(error)
                                                    res.status(500).json({
                                                        "content": "DB Error"
                                                    })
                                                } else {
                                                    console.log("Success update member point")
                                                    res.status(200).json({
                                                        "content": true
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
    if (req.session.admin_email === undefined || Object.keys(req.body).length === 0)
        res.status(401).json({
            "content": false
        })
    else {
        let ideaId = req.body.idea_id
        let searchIdeaSql = "select idea_id, idea_delete, add_point from idea where idea_id = ?;"
        let searchIdeaParam = [ideaId]
        getConnection((conn) => {
            conn.query(searchIdeaSql, searchIdeaParam, function (error, rows, fields) {
                if (error) {
                    console.error(error)
                    res.status(500).json({
                        "content": "DB Error"
                    })
                } else {
                    if (rows.length === 0)
                        res.status(401).json({
                            "content": false
                        })
                    else {
                        if (rows[0].idea_delete === 1)
                            res.status(401).json({
                                "content": false
                            })
                        else {
                            let originalPoint = rows[0].add_point
                            let searchMemberPointSql = "select save_point, use_point, member_ban, member_secede from member where member_email = (select member_email from idea where idea_id = ?);"
                            let searchMemberPointParam = [ideaId]
                            conn.query(searchMemberPointSql, searchMemberPointParam, function (error, rows, fields) {
                                if (error) {
                                    console.error(error)
                                    res.status(500).json({
                                        "content": "DB Error"
                                    })
                                } else {
                                    if (rows[0].length === 0)
                                        res.status(401).json({
                                            "content": false
                                        })
                                    else {
                                        if (rows[0].member_ban === 1 || rows[0].member_secede === 1)
                                            res.status(401).json({
                                                "content": false
                                            })
                                        else {
                                            if (originalPoint === null || originalPoint === 0)
                                                res.status(401).json({
                                                    "content": false
                                                })
                                            else {
                                                let updateIdeaPointSql = "update idea set admin_email = ?, add_point = ?, date_point = ? where idea_id = ?;"
                                                let updateIdeaPointParam = [req.session.admin_email, originalPoint - 500, new Date(), ideaId]
                                                conn.query(updateIdeaPointSql, updateIdeaPointParam, function (error, rows, fields) {
                                                    if (error) {
                                                        console.error(error)
                                                        res.status(500).json({
                                                            "content": "DB Error"
                                                        })
                                                    } else
                                                        console.log("Success update idea point.")
                                                })
                                                // point 테이블 insert.
                                                let insertPointSql = "insert into point (member_email, use_date, use_contents, point) values((select member_email from idea where idea_id = ?), ?, ?, ?);"
                                                let insertPointParam = [ideaId, new Date(), "회수", 500]
                                                conn.query(insertPointSql, insertPointParam, function (error, rows, fields) {
                                                    if (error) {
                                                        console.error(error)
                                                        res.status(500).json({
                                                            "content": "DB Error"
                                                        })
                                                    } else {
                                                        console.log("Success Insert point.")
                                                    }
                                                })
                                                // member 테이블에서 누적 포인트, 사용 포인트 조회 후 누적포인트, 사용자포인트 업데이트.
                                                let updateMemberPointSql = "update member set member_point = ?, save_point = ? where member_email = (select member_email from idea where idea_id = ?);"
                                                let todoAddSavePoint = rows[0].save_point - 500
                                                let todoAddMemberPoint = todoAddSavePoint - rows[0].use_point
                                                let updateMemberPointParam = [todoAddMemberPoint, todoAddSavePoint, ideaId]
                                                conn.query(updateMemberPointSql, updateMemberPointParam, function (error, rows, fields) {
                                                    if (error) {
                                                        console.error(error)
                                                        res.status(500).json({
                                                            "content": "DB Error"
                                                        })
                                                    } else {
                                                        console.log(("Success update member point."))
                                                        res.status(200).json({
                                                            "content": true
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
    if (req.session.admin_email === undefined || Object.keys(req.body).length === 0)
        res.status(401).json({
            "content": false
        })
    else {
        let memberEmail = req.body.member_email
        let searchPointSql = "select member_point, save_point, use_point, member_ban, member_secede from member where member_email = ?"
        let searchPointParam = [memberEmail]
        getConnection((conn) => {
            conn.query(searchPointSql, searchPointParam, function (error, rows, fields) {
                if (error) {
                    console.error(error)
                    res.status(500).json({
                        "content": "DB Error"
                    })
                } else {
                    if (rows.length === 0)
                        res.status(401).json({
                            "content": false
                        })
                    else {
                        if (rows[0].member_secede === 1 || rows[0].member_ban === 1)
                            res.status(401).json({
                                "content": false
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
app.post("/notice/regist", (req, res) => {
    if (req.session.admin_email === undefined || Object.keys(req.body).length === 0)
        res.status(401).json({
            content: false
        })
    else {
        let noticeTitle = req.body.notice_title
        let noticeContents = req.body.notice_contents
    }
})

// 27. 공고정보 조회(관리자)
app.get('/anno/list', (req, res) => {
    if (req.session.admin_email === undefined)
        res.status(401).json({
            content: false
        })
    else {
        let searchAnnoSql = "select anno_flag, anno_title, anno_date from anno limit ?"
        let searchAnnoParam = [15]
        getConnection((conn) => {
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
                        res.status(200).json(rows)
                    }
                }
                conn.release()
            })
        })
    }
})

// 28. 공고정보 상세 조회(관리자)
// TODO Get 방식으로 바꿔야 함.
app.post("/anno/list/detail", (req, res) => {
    if (req.session.admin_email === undefined || Object.keys(req.body).length === 0)
        res.status(401).json({
            content: false
        })
    else {
        let bid = req.body.anno_flag
        let searchDetailAnnoSql = "select anno_contents from anno where anno_flag = ?"
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
                        res.status(200).json(rows)
                    }
                }
            })
        })
    }
})


module.exports = app;