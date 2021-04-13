/**
 * --------------------------------------------------------------------------------------------------------
 * 모듈/필드 변수 부분
 * --------------------------------------------------------------------------------------------------------
 */
const crypto = require("../config/crypto_config.js")
const mailer = require("../config/mail_config.js")

/**
 * --------------------------------------------------------------------------------------------------------
 * 함수 구현 부분
 * --------------------------------------------------------------------------------------------------------
 */
/**
 * 이메일 인증 메일 발송 함수
 * @param receiverEmail : 수신 이메일
 * @param contents : string url
 * @param mailTitle
 */
async function sendEmail(receiverEmail, contents, mailTitle) {
    return await new Promise((resolve, reject) => {
        resolve({
            from: mailer.senderEmail(),
            to: receiverEmail,
            subject: mailTitle,
            text: contents
        })
    })
}

/**
 * 회원 중복조회 함수
 * @param isEmail 회원 테이블에서 조회한 결과
 * @returns {number} 200 = 중복된 이메일 없음, 401 = 이메일 중복
 */
function emailCheck(isEmail) {
    return isEmail === null ? 200 : 401
}

/**
 * 특수 문자 제거
 * @param str
 * @returns {*}
 */
function regExp(str) {
    let reg = /[\{\}\[\]\/?.,;:|\)*~`!^\-_+<>@\#$%&\\\=\(\'\"]/gi
    return reg.test(str) ? str.replace(reg, "") : str
}

async function generateAuthKey() {
    return await new Promise((resolve, reject) => {
        crypto.generateKey().then(keyValue => {
            crypto.getSalt().then(salt => {
                crypto.encryptByHash(keyValue, salt).then(tempAuthKey => {
                    let authKey = regExp(tempAuthKey)
                    resolve(authKey)
                })
            })
        })
    })
}

function masking(str) {
    let originalStr = str
    if (typeof originalStr === "undefined" || originalStr === "")
        return originalStr
    else {
        if (originalStr.length === 3)
            return originalStr.replace(/(?<=.{2})./gi, "*")
        else
            return originalStr.length <= 3 ? originalStr.replace(/(?<=.{1})./gi, "*") : originalStr.replace(/(?<=.{3})./gi, "*")
    }
}

module.exports = {
    sendEmail,
    emailCheck,
    regExp,
    generateAuthKey,
    masking
}