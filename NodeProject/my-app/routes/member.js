/**
 * --------------------------------------------------------------------------------------------------------
 * 모듈/필드 변수 부분
 * --------------------------------------------------------------------------------------------------------
 */
const express = require("express")
const mailer = require("../config/mail_config.js")
const transporter = mailer.init()
const crypto = require("../config/crypto_config.js")
const app = express.Router()
const sessionConfig = require("../config/session_config.js")
const func = require("../common/function.js")
const getConnection = require("../config/database_config.js").getConnection
const logger = require("../config/winston_config.js").logger
const moment = require("moment")
const jwt = require("../common/jwt.js")
require("moment-timezone")
moment.tz.setDefault("Asia/Seoul")
app.use(sessionConfig.init())

/**
 * --------------------------------------------------------------------------------------------------------
 * API 구현 부분
 * --------------------------------------------------------------------------------------------------------
 */

/**
 * 사용자 API
 */
// 1. 회원가입 이용 약관
app.post("/agree", (req, res) => {
    let chosenAgree = req.body.chosen_agree
    if (chosenAgree === undefined)
        res.status(401).json({
            content: false
        })
    else
        // TODO 회원 가입 페이지로 redirect.
        res.cookie("chosen_agree", chosenAgree, {}).status(200).json({content: true})
})

// 2. 이메일 인증메일 보내기
app.post("/email", (req, res) => {
    let tempMemberEmail = req.body.rec_email
    if (tempMemberEmail === undefined || req.cookies.chosen_agree === undefined)
        res.status(401).json({
            content: false
        })
    else {
        let emailCheckQuery = "select member_email, member_secede, member_ban from member where member_email = ?;"
        let selectParam = [tempMemberEmail]
        getConnection((conn) => {
            conn.query(emailCheckQuery, selectParam, function (error, rows) {
                if (error) {
                    console.error(error)
                    res.status(500).json({
                        content: "DB Error"
                    })
                } else {
                    let isEmail = rows.length === 0 ? null : rows[0].member_email
                    let memberCheckValue = func.emailCheck(isEmail)
                    // 최초 가입.
                    if (memberCheckValue === 200) {
                        func.generateAuthKey().then(authKey => {
                            let urlAuthEmail = "<a href = http://152.67.193.89:3000/member/email-check?auth_key=" + authKey + "> 여기를 클릭하세요. </a>"
                            let tomorrow = moment(new Date().setDate(new Date().getDate() + 1)).format("YYYY-MM-DD HH:mm:ss")
                            let insertEmailAuth = "insert into email_auth(email_key, email_auth_flag, email_date, email_dispose, rec_email, temp_chosen_agree) values(" + conn.escape(authKey) + ", "
                                + conn.escape(0) + ", " + conn.escape(tomorrow) + ", " + conn.escape(0) + ", " + conn.escape(tempMemberEmail) + ", " + conn.escape(req.cookies.chosen_agree * 1) + ");"

                            conn.beginTransaction()
                            conn.query(insertEmailAuth, function (error) {
                                if (error) {
                                    conn.rollback()
                                    console.error(error)
                                    res.status(500).json({
                                        content: "DB Error"
                                    })
                                } else {

                                    console.log("Success insert emailAuthData")
                                }
                            })
                            func.sendEmail(tempMemberEmail, urlAuthEmail, "[idea platform] Regarding email authentication.").then(mailContents => {
                                transporter.sendMail(mailContents, function (error, info) {
                                    if (error) {
                                        conn.rollback()
                                        console.error(error)
                                        res.status(500).json({
                                            content: "Mail Error"
                                        })
                                    } else {
                                        conn.commit()
                                        // 이메일 인증 코드 전송 완료.
                                        res.clearCookie("chosen_agree").status(200).json({
                                            content: true
                                        })
                                        console.log(info.response)
                                    }
                                })
                            }).catch(error => {
                                console.error(error)
                            })
                        }).catch(error => {
                            console.error(error)
                        })
                    }  // 탈퇴 후 가입.
                    else if (memberCheckValue === 401 && rows[0].member_secede === 1) {
                        // 탈퇴 전 정지된 사용자인 경우.
                        if (rows[0].member_ban === 1) {
                            console.error(error)
                            res.status(401).json({
                                content: false
                            })
                        }
                        // 탈퇴 전 정지된 사용자가 아닌 경우(재가입).
                        else {
                            func.generateAuthKey().then(authKey => {
                                let urlAuthEmail = "<a href = http://152.67.193.89:3000/member/email-check?auth_key=" + authKey + "> 여기를 클릭하세요. </a>"
                                let tomorrow = moment(new Date().setDate(new Date().getDate() + 1)).format("YYYY-MM-DD HH:mm:ss")
                                let insertEmailAuth = "insert into email_auth(email_key, email_auth_flag, email_date, email_dispose, rec_email, temp_chosen_agree) values(" + conn.escape(authKey) + ", "
                                    + conn.escape(0) + conn.escape(tomorrow) + ", " + conn.escape(0) + ", " + conn.escape(tempMemberEmail) + ", " + conn.escape(req.cookies.chosen_agree * 1) + ");"
                                conn.beginTransaction()
                                conn.query(insertEmailAuth, function (error, rows) {
                                    if (error) {
                                        conn.rollback()
                                        console.error(error)
                                        res.status(500).json({
                                            content: "DB Error"
                                        })
                                    } else {
                                        console.log("Success insert emailAuthData")
                                    }
                                })
                                func.sendEmail(tempMemberEmail, urlAuthEmail, "[idea platform] Regarding email authentication.").then(mailContents => {
                                    transporter.sendMail(mailContents, function (error, info) {
                                        if (error) {
                                            conn.rollback()
                                            res.status(500).json({
                                                content: "Mail Error"
                                            })
                                        } else {
                                            conn.commit()
                                            // 이메일 인증 코드 전송 완료.
                                            res.clearCookie("chosen_agree").status(200).json({
                                                content: true
                                            })
                                            console.log(info.response)
                                        }
                                    })
                                }).catch(error => {
                                    console.error(error)
                                })
                            }).catch(error => {
                                console.error(error)
                            })
                        }
                    }
                    // 이미 가입 되어 있고, 탈퇴하지 않은 회원.
                    else
                        res.status(memberCheckValue).json({
                            content: false
                        })
                }
                conn.release()
            })
        })
    }
})

// 3. 이메일 인증
app.get('/email-check', (req, res) => {
    let authKey = req.query.auth_key
    if (authKey === undefined)
        res.status(401).json({
            content: false
        })
    else {
        // 폐기 처리 되어 있는 인증 코드에 다시 접근하지 못하도록 구현.
        let disPoseCheck = "select NOW() as now , email_key, email_dispose, email_date from email_auth where email_key = ?"
        let authKeyParam = [authKey]
        getConnection((conn) => {
            conn.query(disPoseCheck, authKeyParam, function (error, rows) {
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
                        if (rows[0].email_dispose === 1)
                            res.status(401).json({
                                content: false
                            })
                        else {
                            // 이메일 인증 url을 클릭 하면, 해당 키의 인증 여부, 유효기간 체크. 현재 날짜보다 작으면 폐기 처리.
                            let today = rows[0].now
                            let emailDate = rows[0].email_date
                            if (emailDate < today) {
                                let disposeUpdate = "update email_auth set email_dispose = ? where email_key = ?;"
                                let disposeParam = [1, rows[0].email_key]
                                conn.beginTransaction()
                                conn.query(disposeUpdate, disposeParam, function (error, rows) {
                                    if (error) {
                                        conn.rollback()
                                        console.error(error)
                                        res.status(500).json({
                                            content: "DB Error"
                                        })
                                    } else {
                                        conn.commit()
                                        console.log("Update Dispose Query is Executed.")
                                        res.status(401).json({
                                            content: false
                                        })
                                    }
                                })

                            } else {
                                // 정상 접근 시 전송된 email의 url을 클릭하면, 해당 키에 해당하는 인증 여부, 폐기 처리 업데이트.
                                let updateSql = "update email_auth set email_auth_flag = ?, email_dispose = ? where email_key = ?;"
                                let updateParam = [1, 1, rows[0].email_key]
                                conn.beginTransaction()
                                conn.query(updateSql, updateParam, function (error, rows) {
                                    if (error) {
                                        conn.rollback()
                                        console.error(error)
                                        res.status(500).json({
                                            content: "DB Error"
                                        })
                                    } else {
                                        console.log("Update Flag and Dispose Query is Executed.")
                                    }
                                })

                                // 키가 일치하면 회원가입 페이지로 redirect
                                if (authKey === rows[0].email_key) {
                                    req.session.auth_key = authKey
                                    //TODO 회원 가입 페이지로 redirect.(인증한 이메일 정보를 어떻게 가지고 가야될지 고민.)
                                    req.session.save(function (error) {
                                        if (error) {
                                            conn.rollback()
                                            res.status(500).json({
                                                content: "Session Error"
                                            })
                                        } else {
                                            conn.commit()
                                            res.status(200).json({
                                                content: true
                                            })
                                        }
                                    })
                                } else {
                                    conn.commit()
                                    // 키 불일치.
                                    res.status(401).json({
                                        content: false
                                    })
                                }
                            }
                        }
                    }
                }
                conn.release()
            })
        })
    }
})

// 4. 회원가입
app.post("/signup", (req, res) => {
    let authKey = req.session.auth_key
    if (authKey === undefined || req.body.member_name === undefined || req.body.member_sex === undefined || req.body.member_birth === undefined ||
        req.body.member_company === undefined || req.body.member_state === undefined || req.body.member_pw === undefined || req.body.member_phone === undefined)
        res.status(401).json({
            content: false
        })
    else {
        let memberName = req.body.member_name
        let memberSex = req.body.member_sex
        let memberBirth = req.body.member_birth
        let memberCompany = req.body.member_company
        let memberState = req.body.member_state
        let memberPw = req.body.member_pw
        let memberPhone = req.body.member_phone
        // 인증 키에 해당하는 사용자 이메일로 사용자 테이블 조회.
        let recEmailSql = "select rec_email, temp_chosen_agree from email_auth where email_key = ?;"
        let recEmailParam = [authKey]
        getConnection((conn) => {
            conn.query(recEmailSql, recEmailParam, function (error, rows) {
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
                        let tempEmail = rows[0].rec_email
                        let chosenAgreeValue = rows[0].temp_chosen_agree
                        // 이메일 인증 없이 인증 키를 우연히 맞춰서 회원 가입 페이지를 우회해서 들어 왔을 때
                        // 이미 있는 이메일로 가입 하면 primary key 중복으로 서버 죽을 수 있으므로. 사용자 조회 한번 더 할 필요가 있음.
                        let memberCheckSql = "select member_email, member_secede from member where member_email = ?;"
                        let memberCheckParam = [tempEmail]
                        conn.query(memberCheckSql, memberCheckParam, function (error, rows) {
                            if (error) {
                                console.error(error)
                                res.status(500).json({
                                    content: "DB Error"
                                })
                            } else {
                                let isEmail = rows.length === 0 ? null : rows[0].member_email
                                let memberCheckValue = func.emailCheck(isEmail)
                                crypto.getSalt().then(salt => {
                                    crypto.encryptByHash(memberPw, salt).then(encryptedPw => {
                                        crypto.encryption(memberPhone).then(encryptedPhone => {
                                            // 없으면 최초 가입.
                                            if (memberCheckValue === 200) {
                                                let insertSql = "insert into member(member_email, member_name, member_sex, member_birth, member_company, member_state, member_pw, member_phone, member_ban, chosen_agree, member_salt, member_secede) values(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);"
                                                let insertParam = [tempEmail, memberName, memberSex, memberBirth, memberCompany, memberState, encryptedPw, encryptedPhone, 0, chosenAgreeValue, salt, 0]
                                                conn.beginTransaction()
                                                conn.query(insertSql, insertParam, function (error, rows) {
                                                    if (error) {
                                                        conn.rollback()
                                                        console.error(error)
                                                        res.status(500).json({
                                                            content: "DB Error"
                                                        })
                                                    } else {
                                                        // req.session.member_email = tempEmail
                                                        // req.session.member_pw = encryptedPw
                                                        // req.session.save(function (error) {
                                                        //     if (error) {
                                                        //         conn.rollback()
                                                        //         res.status(500).json({
                                                        //             content: "Session Error"
                                                        //         })
                                                        //     } else {
                                                        //         console.log("Insert Into member Query is Executed.")
                                                        //     }
                                                        // })

                                                        delete req.session.auth_key
                                                        req.session.save(function (error) {
                                                            if (error) {
                                                                conn.rollback()
                                                                res.status(500).json({
                                                                    content: "Session Error"
                                                                })
                                                            } else {
                                                                console.log("delete session auth key.")
                                                                // TODO 메인 페이지로 redirect
                                                                res.status(200).json({
                                                                    content: true
                                                                })
                                                            }
                                                        })
                                                    }
                                                })

                                                // log 추가.
                                                let memberLogInsert = "insert into member_log(member_email, member_log_join, member_login_lately) values(?, ?, ?);"
                                                let today = moment(new Date()).format("YYYY-MM-DD HH:mm:ss")
                                                let memberLogInsertParam = [tempEmail, today, today]
                                                conn.query(memberLogInsert, memberLogInsertParam, function (error, rows) {
                                                    if (error) {
                                                        conn.rollback()
                                                        console.error(error)
                                                        res.status(500).json({
                                                            content: "DB Error"
                                                        })
                                                    } else
                                                        console.log("Success.")
                                                })

                                                // log 추가.
                                                let memberLoginLogInsert = "insert into member_login_log(member_email, member_login) values(?, ?);"
                                                let memberLoginLogParam = [tempEmail, today]
                                                conn.query(memberLoginLogInsert, memberLoginLogParam, function (error, rows) {
                                                    if (error) {
                                                        conn.rollback()
                                                        console.error(error)
                                                        res.status(500).json({
                                                            content: "DB Error"
                                                        })
                                                    } else {
                                                        console.log("Success.")
                                                        conn.commit()
                                                    }
                                                })
                                            }
                                            // 이메일이 있고, 탈퇴 여부 1 이면 재가입.
                                            else if (memberCheckValue === 401 && rows[0].member_secede === 1) {
                                                let newEmail = rows[0].member_email
                                                let updateSql = "update member set member_name = ?, member_sex = ?, member_birth = ?, member_company = ?, member_state = ?, member_pw = ?, member_phone = ?, member_ban = ?, chosen_agree = ?, member_salt = ?, member_secede = ? where member_email = ?"
                                                let updateParam = [memberName, memberSex, memberBirth, memberCompany, memberState, encryptedPw, encryptedPhone, 0, chosenAgreeValue, salt, 0, newEmail]
                                                conn.beginTransaction()
                                                conn.query(updateSql, updateParam, function (error, rows) {
                                                    if (error) {
                                                        conn.rollback()
                                                        console.error(error)
                                                        res.status(500).json({
                                                            content: "DB Error"
                                                        })
                                                    } else {
                                                        // req.session.member_email = newEmail
                                                        // req.session.member_pw = encryptedPw
                                                        // req.session.save(function (error) {
                                                        //     if (error)
                                                        //         res.status(500).json({
                                                        //             content: "Session Error"
                                                        //         })
                                                        //     else
                                                        //         console.log("update query is executed.")
                                                        // })

                                                        delete req.session.auth_key
                                                        req.session.save(function (error) {
                                                            if (error)
                                                                res.status(500).json({
                                                                    content: "Session Error"
                                                                })
                                                            else {
                                                                // TODO 메인 페이지로 redirect
                                                                // res.redirect(307, "/")
                                                                res.status(200).json({
                                                                    content: true
                                                                })
                                                            }
                                                        })
                                                    }
                                                })

                                                // log 추가.
                                                let memberLogInsert = "insert into member_log(member_email, member_log_join, member_login_lately) values(?, ?, ?);"
                                                let today = moment(new Date()).format("YYYY-MM-DD HH:mm:ss")
                                                let memberLogInsertParam = [newEmail, today, today]
                                                conn.query(memberLogInsert, memberLogInsertParam, function (error, rows) {
                                                    if (error) {
                                                        conn.rollback()
                                                        console.error(error)
                                                        res.status(500).json({
                                                            content: "DB Error"
                                                        })
                                                    } else {
                                                        // req.session.join_lately = today
                                                        // req.session.save(function (err) {
                                                        //     if (err)
                                                        //         res.status(500).json({
                                                        //             content: "Session Error"
                                                        //         })
                                                        // })
                                                        console.log("Success.")
                                                    }
                                                })

                                                // log 추가.
                                                let memberLoginLogInsert = "insert into member_login_log(member_email, member_login) values(?, ?);"
                                                let memberLoginLogParam = [newEmail, today]
                                                conn.query(memberLoginLogInsert, memberLoginLogParam, function (error, rows) {
                                                    if (error) {
                                                        conn.rollback()
                                                        console.error(error)
                                                        res.status(500).json({
                                                            content: "DB Error"
                                                        })
                                                    } else {
                                                        conn.commit()
                                                        console.log("Success.")
                                                    }
                                                })
                                            }
                                            // 이메일이 있고, 탈퇴 여부 0 이면 이미 있는 사용자
                                            else
                                                // memberCheckValue === 401 && rows[0].member_secede === 0
                                                res.status(401).json({
                                                    content: false
                                                })
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
                        })
                    }
                }
                conn.release()
            })
        })
    }
})

// 5. 로그인
app.post("/login", (req, res) => {
    let memberEmail = req.body.member_email
    let tempPw = req.body.member_pw
    if (memberEmail === undefined || tempPw === undefined)
        res.status(401).json({
            content: false
        })
    else {
        let selectSql = "select member_email, member_pw, member_ban, member_salt, member_secede from member where member_email = ?;"
        let selectParam = [memberEmail]
        getConnection((conn) => {
            conn.query(selectSql, selectParam, function (error, rows) {
                if (error) {
                    console.error(error)
                    res.status(500).json("DB Error")
                } else {
                    let isEmail = rows.length === 0 ? null : rows[0].member_email
                    let memberCheckValue = func.emailCheck(isEmail)
                    // 회원 테이블에 중복된 이메일이 없으면.
                    if (memberCheckValue === 200)
                        res.status(401).json({
                            content: false
                        })
                    // 회원 테이블에 입력한 이메일이 있고 탈퇴 여부가 0이면(탈퇴하지 않았으면).
                    else if (memberCheckValue === 401 && rows[0].member_secede === 0) {
                        // 정지된 회원인 경우.
                        if (rows[0].member_ban === 1)
                            // TODO 로그인 실패(정지된 회원인 경우). 다시 로그인 화면으로 redirect
                            res.status(401).json({
                                content: false
                            })
                        else {
                            crypto.encryptByHash(tempPw, rows[0].member_salt).then(memberPw => {
                                // 입력한 비밀번호 해시 암호화 한 값과 회원 테이블에 해당 이메일의 비밀번호 값 비교 및 정지여부 확인.
                                conn.beginTransaction()
                                if (memberPw === rows[0].member_pw) {
                                    // req.session.member_email = rows[0].member_email
                                    // req.session.member_pw = rows[0].member_pw
                                    // req.session.save(function (error) {
                                    //     if (error) {
                                    //         conn.rollback()
                                    //         res.status(500).json({
                                    //             content: "Session Error"
                                    //         })
                                    //     }
                                    // })
                                    const user = {
                                        email: rows[0].member_email
                                    }

                                    let accessToken
                                    let refreshToken
                                    jwt.sign(user).then(result => {
                                        accessToken = result.access_token
                                        refreshToken = result.refresh_token

                                        let memberLogUpdate = "update member_log set member_login_lately = ? where member_log.member_email = ?;"
                                        let today = moment(new Date()).format("YYYY-MM-DD HH:mm:ss")
                                        let memberLogParam = [today, rows[0].member_email]
                                        conn.query(memberLogUpdate, memberLogParam, function (error) {
                                            if (error) {
                                                conn.rollback()
                                                console.error(error)
                                                res.status(500).json({
                                                    content: "DB Error"
                                                })
                                            } else
                                                console.log("update query is executed.")
                                        })

                                        let memberLoginLogInsert = "insert into member_login_log(member_email, member_login) values(?, ?);"
                                        let memberLoginLogParam = [rows[0].member_email, today]
                                        conn.query(memberLoginLogInsert, memberLoginLogParam, function (error) {
                                            if (error) {
                                                conn.rollback()
                                                console.error(error)
                                                res.status(500).json({
                                                    content: "DB Error"
                                                })
                                            } else {
                                                conn.commit()
                                                console.log("insert query is executed.")
                                            }
                                        })

                                        // TODO 메인 페이지로 이동
                                        res.status(200).json({
                                            content: true,
                                            access_token: accessToken,
                                            refresh_token: refreshToken
                                        })
                                    }).catch(error => {
                                        console.error(error)
                                    })
                                } else {
                                    // TODO 로그인 실패(비밀번호가 틀린 경우). 다시 로그인 화면으로 redirect
                                    res.status(401).json({
                                        content: false
                                    })
                                }
                            }).catch(error => {
                                console.error(error)
                            })
                        }
                    } else {
                        // TODO 로그인 실퍠(탈퇴회원인 경우). 다시 로그인 화면으로 redirect
                        res.status(401).json({
                            content: false
                        })
                    }
                    conn.release()
                }
            })
        })
    }

})

// 6. 로그아웃
app.post("/logout", (req, res) => {
    req.session.destroy()
    // TODO 로그인 페이지로 이동
    res.status(200).json({
        content: true
    })
})

// 7. 회원탈퇴
app.delete("/secede", (req, res) => {
    let sessionEmail = req.session.member_email
    if (sessionEmail === undefined)
        res.status(401).json({
            content: false
        })
    else {
        let compareSql = "select member_email from member where member_email = ?;"
        let compareParam = [sessionEmail]
        getConnection((conn) => {
            conn.query(compareSql, compareParam, function (error, rows) {
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
                        if (sessionEmail === rows[0].member_email) {
                            let updateSql = "update member set member_secede = ? where member_email = ?;"
                            let updateParam = [1, rows[0].member_email]
                            conn.beginTransaction()
                            conn.query(updateSql, updateParam, function (error, rows) {
                                if (error) {
                                    conn.rollback()
                                    console.error(error)
                                    res.status(500).json({
                                        content: "DB Error"
                                    })
                                } else {
                                    conn.commit()
                                    console.log("update query is executed.")
                                    req.session.destroy()
                                    // TODO 메인 페이지로 이동
                                    res.status(200).json({
                                        content: "Success secede."
                                    })
                                }
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

// 8. 비밀번호 찾기
app.post("/pw/find", (req, res) => {
    let tempEmail = req.body.member_email
    if (tempEmail === undefined)
        res.status(401).json({
            content: false
        })
    else {
        let selectSql = "select member_email, member_ban, member_secede from member where member_email = ?;"
        let selectParma = [tempEmail]
        getConnection((conn) => {
            conn.query(selectSql, selectParma, function (error, rows) {
                if (error) {
                    console.error(error)
                    res.status(500).json({
                        content: "DB Error"
                    })
                } else {
                    // 사용자 중복 조회.
                    let isEmail = rows.length === 0 ? null : rows[0].member_email
                    let memberCheckValue = func.emailCheck(isEmail)
                    // 중복된 이메일이 없음.
                    if (memberCheckValue === 200)
                        res.status(401).json({
                            content: false
                        })
                    // 이메일이 있음.
                    else {
                        // 정지, 탈퇴 여부 체크
                        if (rows[0].member_ban === 0 && rows[0].member_secede === 0) {
                            func.generateAuthKey().then(key => {
                                let tomorrow = moment(new Date().setDate(new Date().getDate() + 1)).format("YYYY-MM-DD HH:mm:ss")
                                let insertSql = "insert into pw_find(pw_key, pw_edit, pw_date, pw_dispose, member_email) values(" + conn.escape(key) + ", " + conn.escape(0) + ", "
                                    + conn.escape(tomorrow) + ", " + conn.escape(0) + ", " + conn.escape(rows[0].member_email) + ");"
                                conn.beginTransaction()
                                conn.query(insertSql, function (error, rows) {
                                    if (error) {
                                        conn.rollback()
                                        console.error(error)
                                        res.status(500).json({
                                            content: "DB Error"
                                        })
                                    } else
                                        console.log("insert query is executed.")
                                })

                                let urlPassword = "http://152.67.193.89:3000/member/pw/reset-redirect?pw_key=" + key
                                func.sendEmail(isEmail, urlPassword, "[idea platform] Regarding email authentication.").then(mailContents => {
                                    transporter.sendMail(mailContents, function (error, info) {
                                        if (error) {
                                            conn.rollback()
                                            res.status(401).json({
                                                content: "Mail error"
                                            })
                                        }
                                        else {
                                            conn.commit()
                                            // 이메일 인증 코드 전송 완료.
                                            res.status(200).json({
                                                content: true
                                            })
                                            console.log(info.response)
                                        }
                                    })
                                }).catch(error => {
                                    console.error(error)
                                })
                            }).catch(error => {
                                console.error(error)
                            })

                        } else
                            // 정지 혹은 탈퇴한 사용자.
                            res.status(401).json({
                                content: false
                            })
                    }
                }
                conn.release()
            })
        })
    }
})

// 9. 비밀번호 재설정 바로가기
app.get('/pw/reset-redirect', (req, res) => {
    let pwKey = req.query.pw_key
    if (pwKey === undefined)
        res.status(401).json({
            content: false
        })
    else {
        let compareSql = "select NOW() as now, pw_key, pw_edit, pw_date, pw_dispose, member_email from pw_find where pw_key = ?"
        let compareParam = [pwKey]
        getConnection((conn) => {
            conn.query(compareSql, compareParam, function (error, rows) {
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
                        // 키가 일치할 경우
                        if (pwKey === rows[0].pw_key) {
                            // 폐기 여부 조회 폐기 됬으면 접근 불가
                            if (rows[0].pw_dispose === 1)
                                res.status(401).json({
                                    content: false
                                })
                            // 폐기 되지 않았을 때
                            else {
                                // 유효기간이 지났으면 폐기 처리 후 접근 불가
                                let today = rows[0].now
                                if (rows[0].pw_date < today) {
                                    let updateDispose = "update pw_find set pw_dispose = ? where pw_key = ?"
                                    let updateParam = [1, rows[0].pw_key]
                                    conn.beginTransaction()
                                    conn.query(updateDispose, updateParam, function (error, rows) {
                                        if (error) {
                                            conn.rollback()
                                            console.error(error)
                                            res.status(500).json({
                                                content: "DB Error"
                                            })
                                        } else {
                                            conn.commit()
                                            console.log("pw_dispose update")
                                            res.status(401).json({
                                                content: false
                                            })
                                        }
                                    })
                                }
                                // TODO 정상 접근, 재설정 페이지로 바로가기.
                                else {
                                    req.session.pwKey = rows[0].pw_key
                                    req.session.save(function (error) {
                                        if (error)
                                            res.status(500).json({
                                                content: "Session error"
                                            })
                                        else
                                            res.status(200).json({
                                                content: true
                                            })
                                    })
                                }
                            }
                        }
                        // 키 불일치.
                        else {
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

// 10. 비밀번호 재설정
app.patch("/pw/reset", (req, res) => {
    let newPw = req.body.member_pw
    let pwKey = req.session.pwKey
    if (newPw === undefined || pwKey === undefined)
        res.status(401).json({
            content: false
        })
    else {
        let selectSql = "select member_email from pw_find where pw_key = ?"
        let selectParam = [pwKey]
        getConnection((conn) => {
            // 세션에 있는 키 값으로 사용자 이메일 조회.
            conn.query(selectSql, selectParam, function (error, rows) {
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
                        // 해당 이메일과 일치하는 사용자 테이블의 패스워드 암호화 후 업데이트.
                        let memberCheckSql = "select member_email, member_ban, member_secede from member where member_email = ?;"
                        let memberCheckParam = [rows[0].member_email]
                        conn.query(memberCheckSql, memberCheckParam, function (error, rows) {
                            if (error) {
                                console.error(error)
                                res.status(500).json({
                                    content: "DB Error"
                                })
                            } else {
                                let isEmail = rows.length === 0 ? null : rows[0].member_email
                                let memberCheckValue = func.emailCheck(isEmail)
                                // 해당 사용자가 없음.
                                if (memberCheckValue === 200)
                                    res.status(401).json({
                                        content: false
                                    })
                                else if (memberCheckValue === 401 && rows[0].member_ban === 0 && rows[0].member_secede === 0) {
                                    crypto.getSalt().then(salt => {
                                        crypto.encryptByHash(newPw, salt).then(encryptedNewPw => {
                                            let tempEmail = rows[0].member_email
                                            let memberUpdateSql = "update member set member_pw = ?, member_salt = ? where member_email = ?;"
                                            let memberUpdateParam = [encryptedNewPw, salt, tempEmail]
                                            conn.beginTransaction()
                                            conn.query(memberUpdateSql, memberUpdateParam, function (error, rows) {
                                                if (error) {
                                                    conn.rollback()
                                                    console.error(error)
                                                    res.status(500).json({
                                                        content: "DB Error"
                                                    })
                                                } else {
                                                    // TODO 메인 페이지로 redirect
                                                    res.status(200).json({
                                                        content: true
                                                    })
                                                }
                                            })
                                            // 재설정 여부, 폐기 여부 update 후 세션 삭제.
                                            let pwUpdateSql = "update pw_find set pw_edit = ?, pw_dispose = ? where pw_key = ?;"
                                            let pwUpdateParam = [1, 1, pwKey]
                                            conn.query(pwUpdateSql, pwUpdateParam, function (error, rows) {
                                                if (error) {
                                                    conn.rollback()
                                                    console.error(error)
                                                    res.status(500).json({
                                                        content: "DB Error"
                                                    })
                                                } else {
                                                    console.log("update pw log query is executed.")
                                                    delete req.session.pwKey
                                                    req.session.save(function (err) {
                                                        if (err) {
                                                            conn.rollback()
                                                            res.status(500).json({
                                                                content: "Session Error"
                                                            })
                                                        } else {
                                                            conn.commit()
                                                        }
                                                    })
                                                }
                                            })
                                        }).catch(error => {
                                            console.error(error)
                                        })
                                    }).catch(error => {
                                        console.error(error)
                                    })
                                } else
                                    res.status(401).json({
                                        content: false
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

// 11. 회원정보 수정
app.post("/update", (req, res) => {
    let memberPw = req.body.member_pw
    let memberEmail = req.session.member_email
    if (memberPw === undefined || memberEmail === undefined)
        res.status(401).json({
            content: false
        })
    else {
        let compareSql = "select member_pw, member_salt from member where member_email = ?"
        let compareParam = [memberEmail]
        getConnection((conn) => {
            conn.query(compareSql, compareParam, function (error, rows) {
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
                        crypto.encryptByHash(memberPw, rows[0].member_salt).then(encryptedPw => {
                            if (encryptedPw !== rows[0].member_pw)
                                res.status(401).json({
                                    content: false
                                })
                            else
                                // TODO 회원정보 상세 페이지로 redirect.
                                res.status(200).json({
                                    content: true
                                })
                        }).catch(error => {
                            console.error(error)
                        })
                    }
                }
                conn.release()
            })
        })
    }
})

// 12. 회원정보 수정 상세
app.patch("/update-detail", (req, res) => {
    let memberEmail = req.session.member_email
    if (memberEmail === undefined || req.body.member_name === undefined || req.body.member_pw === undefined || req.body.member_sex === undefined ||
        req.body.member_birth === undefined || req.body.member_phone === undefined || req.body.member_company === undefined || req.body.member_state === undefined)
        res.status(401).json({
            content: false
        })
    else {
        let memberName = req.body.member_name
        let memberPw = req.body.member_pw
        let memberSex = req.body.member_sex
        let memberBirth = req.body.member_birth
        let memberPhone = req.body.member_phone
        let memberCompany = req.body.member_company
        let memberState = req.body.member_state
        let updateSql = "update member set member_name = ?, member_pw = ?, member_sex = ?, member_birth = ?, member_phone = ?, member_company = ?, member_state = ?, member_salt = ? where member_email = ?"
        let updateParam
        crypto.getSalt().then(salt => {
            crypto.encryptByHash(memberPw, salt).then(encryptedPw => {
                crypto.encryption(memberPhone).then(encryptedPhone => {
                    updateParam = [memberName, encryptedPw, memberSex, memberBirth, encryptedPhone, memberCompany, memberState, salt, memberEmail]
                    getConnection((conn) => {
                        conn.beginTransaction()
                        conn.query(updateSql, updateParam, function (error, rows) {
                            if (error) {
                                conn.rollback()
                                console.error(error)
                                res.status(500).json({
                                    content: "DB Error"
                                })
                            } else {
                                req.session.member_pw = encryptedPw
                                req.session.save(function (err) {
                                    if (err) {
                                        conn.rollback()
                                        res.status(500).json({
                                            content: "Session Error"
                                        })
                                    }
                                    else {
                                        conn.commit()
                                        // TODO 마이페이지로 redirect.
                                        res.status(201).json({
                                            content: true
                                        })
                                    }
                                })
                            }
                            conn.release()
                        })
                    })
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
})

// 13. 사용자 아이디어 조회
app.get("/myidea", (req, res) => {
    let sessionEmail = req.session.member_email
    if (sessionEmail === undefined)
        res.status(401).json({
            content: false
        })
    else {
        getConnection((conn) => {
            let getCountSql = "select count(*) as count from idea where idea_delete != ? and member_email = ?;"
            let getCountParam = [1, sessionEmail]
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
                                    let ideaSql = "select idea_title, idea_date from idea where idea_delete != ? and member_email = ? order by idea_date desc limit ?, ?;"
                                    let ideaParam = [1, sessionEmail, start, pageSize]
                                    conn.query(ideaSql, ideaParam, function (error, rows) {
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
                                                let myIdeaStruct = []
                                                for (let i = 0; i < rows.length; i++) {
                                                    myIdeaStruct.push({
                                                        idea_title: rows[i].idea_title,
                                                        idea_date: rows[i].idea_date
                                                    })
                                                }
                                                res.status(200).json({
                                                    myIdeaStruct
                                                })
                                            }
                                        }
                                    })
                                }
                            }
                        } else {
                            let ideaSql = "select idea_title, idea_date from idea where idea_delete != ? and member_email = ? order by idea_date desc limit ?, ?;"
                            let ideaParam = [1, sessionEmail, 0, rows[0].count]
                            conn.query(ideaSql, ideaParam, function (error, rows) {
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
                                        let myIdeaStruct = []
                                        for (let i = 0; i < rows.length; i++) {
                                            myIdeaStruct.push({
                                                idea_title: rows[i].idea_title,
                                                idea_date: rows[i].idea_date
                                            })
                                        }
                                        res.status(200).json({
                                            myIdeaStruct
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

// 14. 관심 사업 조회
app.get("/marked", (req, res) => {
    let sessionEmail = req.session.member_email
    if (sessionEmail === undefined)
        res.status(401).json({
            content: false
        })
    else {
        getConnection((conn) => {
            let getCountSql = "select count(*) as count from inter_anno join member on inter_anno.member_email = member.member_email where inter_anno.member_email = ? and member_ban != ? and member_secede != ?;"
            let getCountParam = [sessionEmail, 1, 1]
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
                                    let markedSql = "select anno_title, anno_date\n" +
                                        "from inter_anno as ia\n" +
                                        "         join anno as a on ia.anno_id = a.anno_id\n" +
                                        "join member on ia.member_email = member.member_email\n" +
                                        "where ia.member_email = ? and member_ban != ? and member_secede != ?\n" +
                                        "order by anno_date\n" +
                                        "    desc\n" +
                                        "limit ?, ?;"
                                    let markedParam = [sessionEmail, 1, 1, start, pageSize]
                                    conn.query(markedSql, markedParam, function (error, rows) {
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
                                                let interAnnoInfo = []
                                                for (let i = 0; i < rows.length; i++) {
                                                    interAnnoInfo.push({
                                                        "anno_title": rows[i].anno_title,
                                                        "anno_date": rows[i].anno_date
                                                    })
                                                }
                                                res.status(200).json({
                                                    interAnnoInfo
                                                })
                                            }
                                        }
                                    })
                                }
                            }
                        } else {
                            let markedSql = "select anno_title, anno_date\n" +
                                "from inter_anno as ia\n" +
                                "         join anno as a on ia.anno_id = a.anno_id\n" +
                                "join member on ia.member_email = member.member_email\n" +
                                "where ia.member_email = ? and member_ban != ? and member_secede != ?\n" +
                                "order by anno_date\n" +
                                "    desc\n" +
                                "limit ?, ?;"
                            let markedParam = [sessionEmail, 1, 1, 0, rows[0].count]
                            conn.query(markedSql, markedParam, function (error, rows) {
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
                                        let interAnnoInfo = []
                                        for (let i = 0; i < rows.length; i++) {
                                            interAnnoInfo.push({
                                                "anno_title": rows[i].anno_title,
                                                "anno_date": rows[i].anno_date
                                            })
                                        }
                                        res.status(200).json({
                                            interAnnoInfo
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