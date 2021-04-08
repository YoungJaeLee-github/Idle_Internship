/**
 * --------------------------------------------------------------------------------------------------------
 * 모듈/필드 변수 부분
 * --------------------------------------------------------------------------------------------------------
 */
const express = require("express")
const mailer = require("../config/mail_config.js")
const databaseConfig = require("../config/database_config.js")
const crypto = require("../config/crypto_config.js")
const app = express.Router()
const transporter = mailer.init()
const conn = databaseConfig.init()
const sessionConfig = require("../config/session_config.js")
app.use(sessionConfig.init())

/**
 * --------------------------------------------------------------------------------------------------------
 * API 구현 부분
 * --------------------------------------------------------------------------------------------------------
 */

/**
 * 고객센터 API
 */


module.exports = app;