'use strict';

const line = require('@line/bot-sdk');
const express = require('express');
const crypto = require('crypto');
const { Client } = require('pg');

// create LINE SDK config from env variables
const config = {
  channelAccessToken: process.env.LINE_BOT_CHANNEL_TOKEN,
  channelSecret: process.env.LINE_BOT_CHANNEL_SECRET,
};

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY
const BUFFER_KEY = process.env.BUFFER_KEY
const ENCRYPT_METHOD = "aes-256-cbc" // 暗号化方式
const ENCODING = "hex" // 暗号化時のencoding

// create Express app
// about Express itself: https://expressjs.com/
const app = express();

// APIコールのためのクライアントインスタンスを作成
const client = new line.Client(config);
let dbclient = {}

//入力待ちかどうかを検出する
let isRecord = {
    waitAnswer : false,
    userId : ""
}

// すべてのイベント処理のプロミスを格納する配列。
let events_processed = [];

//確認テンプレートがすでに押されているかを確認する
let isPushConfirmTemplate = true;

app.post('/callback', line.middleware(config), (req, res) => {
    dbclient = new Client({
        connectionString: process.env.DATABASE_URL,
      });
    
    res.sendStatus(200);

    events_processed  = [];

    // イベントオブジェクトを順次処理。
    req.body.events.forEach((event) => {
        if(isRecord.waitAnswer) {
            if(isRecord.userId == event.source.userId) {
                recordLeftover(event);
                isRecord.waitAnswer = false;
                isRecord.userId = "";
            }
        }else {
            // この処理の対象をイベントタイプがメッセージで、かつ、テキストタイプだった場合に限定。
            if (event.type == "message" && event.message.type == "text"){
                //数字だけのテキストかどうかを判定
                let numFlag = isInteger(event);
                if(numFlag) {
                    recordStockPrice(event);
                } else {
                    switch (true) {
                        case /^こんにちは$/.test(event.message.text):
                            events_processed.push(client.replyMessage(event.replyToken, {
                                type: "text",
                                text: "どうもだなも!"
                            }));
                            break;
                    
                        case /^しずえは$/.test(event.message.text): {
                            events_processed.push(client.replyMessage(event.replyToken, {
                                type: "text",
                                text: "ノーコメントだなも"
                            }));
                            break;
                        }
                        case /^株価一覧$/.test(event.message.text): {
                            const encryptedUserId = getEncryptedString(event.source.userId); 
                            console.log(encryptedUserId);
                            const query = `SELECT time, stock_price FROM stock_price_tb WHERE user_id='${encryptedUserId}' ORDER BY time ASC;`;
                            fetchFromDatabase(query)
                            .then((res) => {
                                let replyText = "";
                                res.rows.forEach((row) => {
                                    let time = row.time;
                                    let data = time.split("/")
                                    if (data[3] == "0") {
                                        replyText += `${data[1]}月${data[2]}日午前の株価:${row.stock_price}ベル\n`
                                    } else if(data[3] == "1") {
                                        replyText += `${data[1]}月${data[2]}日午後の株価:${row.stock_price}ベル\n`
                                    }
                                })
                                replyMessage(event, replyText)
                            }).catch((err) => {
                                replyMessage(event, "株価取得に失敗しただなも");
                            })
                            break;
                        }
                        case /^最高値$/.test(event.message.text): {
                            const time = getCurrentTime();
                            const query = `SELECT user_id, stock_price FROM stock_price_tb WHERE time='${time}' ORDER BY stock_price DESC;`;
                            fetchFromDatabase(query)
                            .then((res) => {
                                const maxPrice = res.rows[0].stock_price;
                                const decryptedUserId = getDecryptedString(res.rows[0].user_id);
                                getUserName(decryptedUserId).then((name) => {
                                    console.log(`名前は${name}`);
                                    replyMessage(event, `今の時間の最高値は${name}さんの${maxPrice}ベルだなも!`);  
                                })
                            }).catch((err) => {
                                replyMessage(event, "株価最高値の取得に失敗しただなも");
                            })
                            break;
                        }
                        case /^余り物記録$/.test(event.message.text) : {
                            replyMessage(event, "記録したい物の名前を入力して欲しいだなも");
                            isRecord.waitAnswer = true;
                            isRecord.userId = event.source.userId;
                        }
                        case /^帰って$/.test(event.message.text): {
                            if (event.message.text == "帰って") {
                                replyMessage(event, "ひどいだなも")
                                .then(() => {
                                    if (event.source.groupId !== undefined) {
                                        client.leaveGroup(event.source.groupId);
                                    } else {
                                        console.log("グループじゃありません")
                                    }
                                })
                            }
                            break;
                        } 

                        case /^余り物リスト$/.test(event.message.text): {
                            const query = `SELECT leftover FROM leftover_tb;`;
                            fetchFromDatabase(query)
                            .then((res) => {
                                if(res.rowCount != 0) {
                                    let replyText = "";
                                    for(let i = 0; i < res.rows.length; i++) {
                                        replyText += `${res.rows[i].leftover}`
                                        if(i !== res.rows.length - 1)　{
                                            replyText += `\n`;
                                        }                                    
                                    }
                                    replyMessage(event, replyText);
                                } else {
                                    replyMessage(event, "そんなもんねえよ");
                                }
                            }).catch((err) => {
                                console.log(err);
                                replyMessage(event, "余り物リスト取得に失敗しただなも");
                            })
                            break;
                        }
                        case /.*欲しい/.test(event.message.text): {
                            const leftoverName = event.message.text.replace("欲しい", "");
                            const query = `SELECT user_id FROM leftover_tb WHERE leftover='${leftoverName}';`;
                            fetchFromDatabase(query)
                            .then((res) => {
                                if(res.rowCount != 0) {
                                    res.rows.forEach((row) => {
                                        const decryptedUserId = getDecryptedString(row.user_id);
                                        getUserName(decryptedUserId).then((name) => {
                                            const replyText = `${leftoverName}は${name}さんが持ってるだなも！`;
                                            replyMessage(event, replyText);
                                        })
                                    })
                                } else {
                                    replyMessage(event, `${leftoverName} does not exist`);
                                }

                            }).catch((err) => {
                                console.log(err);
                                replyMessage(event, "存在しねえよ");
                            })
                            break;
                        }
                        case /.*削除/.test(event.message.text): {
                            const leftoverName = event.message.text.replace("削除", "");
                            const query = `DELETE FROM leftover_tb WHERE leftover='${leftoverName}';`;
                            fetchFromDatabase(query)
                            .then((res) => {
                                if(res.rowCount != 0) {
                                    const replyText = `${leftoverName}を削除しただなも`;
                                    replyMessage(event, replyText);
                                } else {
                                    replyMessage(event, `${leftoverName} does not exist`);
                                }

                            }).catch((err) => {
                                console.log(err);
                                replyMessage(event, "存在しねえよ");
                            })
                            break;
                        }

                        default :
                            if(event.source.groupId === undefined) {
                                tempResponse(event, replyMessage);
                            } 
                            break;

                    }
                }
            } else if(event.type == "postback") {
                if(!isPushConfirmTemplate) {
                    if(JSON.parse(event.postback.data).name == "updateStockPrice") {
                        updateStockPrice(event);
                        replyMessage(event, "")
                        isPushConfirmTemplate = true;
                    } else {
                        replyMessage(event, "わかっただなも");
                    }
                } 
            } else if(event.type == "join") {
                const groupId = event.source.groupId;

            }

            console.log(req.body);
            console.log(req.body.events[0].source)
        }
    });
    // すべてのイベント処理が終了したら何個のイベントが処理されたか出力。
    Promise.all(events_processed).then(
        (response) => {
            console.log(`${response.length} event(s) processed.`);
        }
    );
});

// listen on port
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`listening on ${port}`);
});


async function getUserName(userID) {
    const userId = userID;
    const profile = await client.getProfile(userId)
    return profile.displayName;
}

function getCurrentTime() {
    //数字の0詰めを実装する関数
    var toDoubleDigits = function(num) {
        num += "";
        if (num.length === 1) {
            num = "0" + num;
        }
        return num;     
    
    }
    let date = new Date();
    let year = date.getFullYear();
    let month = toDoubleDigits(date.getMonth() + 1);
    let day = toDoubleDigits(date.getDate());
    let hour = date.getHours();
    console.log(hour);
    let ampm = (hour < 12) ? "0" : "1";
    return (year + '/' + month + '/' + day + '/' + ampm);
}

function getEncryptedString(raw) {
    let iv = Buffer.from(BUFFER_KEY)
    let cipher = crypto.createCipheriv(ENCRYPT_METHOD, Buffer.from(ENCRYPTION_KEY), iv)
    let encrypted = cipher.update(raw)
  
    encrypted = Buffer.concat([encrypted, cipher.final()])
  
    return encrypted.toString(ENCODING)
}

function getDecryptedString(encrypted) {
    let iv = Buffer.from(BUFFER_KEY)
    let encryptedText = Buffer.from(encrypted, ENCODING)
    let decipher = crypto.createDecipheriv(ENCRYPT_METHOD, Buffer.from(ENCRYPTION_KEY), iv)
    let decrypted = decipher.update(encryptedText)
  
    decrypted = Buffer.concat([decrypted, decipher.final()])
  
    return decrypted.toString()
  }

function replyMessage(e, param) {
    return new Promise((resolve) => {
        console.log(`${param}は正常に取得されています`);
        events_processed.push(client.replyMessage(e.replyToken, {
            type: "text",
            text: param
        })
        .then(() => {
            resolve();
        }));
    })
}

function replyConfirmTemplate(e, param, yesData, noData) {
    console.log(`${param}は正常に取得されています()`)
    events_processed.push(client.replyMessage(e.replyToken, {
        type: "template",
        altText: "うんち",
        template: {
            type: "confirm",
            text: param,
            actions: [
                {
                    type: "postback",
                    label: "はい",
                    data: yesData
                },
                {
                    type: "postback",
                    label: "いいえ",
                    data: noData,
                }
            ],
        }
    }))
}

//パターンにないメッセージが来た時にランダムに返信メッセージを決める
async function tempResponse(e, callback) {
    //おそらくプロフィール情報の取得に時間がかかってnameにundefindが入ることがあるので待つ
    const name = await getUserName(e.source.userId)
    console.log(`名前は${name}`);
    const tempTexts = [
        "会話実装めんどくさすぎてはげそうだなも!",
        "ぼくと話す前に早く借金返せだなも！",
        "だなも！",
        "今回の増築代金として，1000000ベル，ローンを組ませていただくだなも！",
        `ぼくに騙されて${name}さんが無人島ツアーに申し込んでくれたおかげで，人生勝ち組だなも`
    ]
    let random = Math.floor( Math.random() * tempTexts.length );
    callback(e, tempTexts[random]);
}

async function fetchFromDatabase(query) {
        await dbclient.connect();
        const res = await dbclient.query(query).catch((err) => {
            console.error(err);
            return err
        })
        console.log("データベースクエリ完了");
        console.log(res);
        await dbclient.end();
        return res;
}

async function updateStockPrice(e) {
    const stockPrice = JSON.parse(e.postback.data).stockP;
    const time = JSON.parse(e.postback.data).time;
    const encryptedUserId = getEncryptedString(e.source.userId);
    const query = `UPDATE stock_price_tb SET stock_price='${stockPrice}' WHERE user_id='${encryptedUserId}' AND time='${time}';`;
    await fetchFromDatabase(query).catch(() => {
        console.log(err);
        replyMessage(e, "データの記録に失敗しただなも");
    })
    console.log("データアップデート完了");
    console.log("update client was closed");
    replyMessage(e, "新しい株価を記録しただなも")
}

async function recordLeftover(e) {
        if(e.message.text == "やっぱやめた") {
            replyMessage(e, "わかっただなも");
        } else {
            const encryptedUserId= getEncryptedString(e.source.userId);
            const text = e.message.text;
            const leftovers = text.split(`\n`);
            let values = "";
            for(let i = 0; i < leftovers.length; i++) {
                if(i == leftovers.length - 1) {
                    values += `('${encryptedUserId}', '${leftovers[i]}');`;
                } else {
                    values += `('${encryptedUserId}', '${leftovers[i]}'),`;
                }
            }
            const query = `INSERT INTO leftover_tb (user_id, leftover) VALUES ` + values;
            const res = await fetchFromDatabase(query).catch(() => {
                console.log(err);
                replyMessage(e, "記録に失敗しただなも");
            })
            replyMessage(e, "記録しただなも");
        }
}

function isInteger(e) {
    let numFlag = true;
    for(let i = 0; i < e.message.text.length; i++) {
        //1文字ずつアスキーコードを比較して数字判定
        let charCode = e.message.text.charCodeAt(i);
        if(charCode < 48  || charCode > 57){
            numFlag = false;
            //１つでも数字以外の文字が見つかった場合for文終わり
            break;
        }
    }
    return numFlag;
}

async function recordStockPrice(e) {
    const stockPrice = e.message.text;
    const encryptedUserId = getEncryptedString(e.source.userId);
    const yyyymmddampm = getCurrentTime();
    const data = yyyymmddampm.split("/");
    let x = "";
    if (data[3] == "0") x = "午前"
    else if(data[3] == "1") x = "午後"
    const displayTimeMessage = yyyymmddampm.slice(0, -1) + x;
    //株価を記録するためのSQL文
    const query = `INSERT INTO stock_price_tb (user_id, stock_price, time) VALUES ('${encryptedUserId}', '${stockPrice}', '${yyyymmddampm}');`;

    await fetchFromDatabase(query).catch((err) => {
        console.log(err);
        isPushConfirmTemplate = false;
        replyConfirmTemplate(e, `今日の${x}の分の株価はすでに記録してあるだなも\n記録を上書きしてもいいだなもか？`, JSON.stringify({name: "updateStockPrice", stockP: stockPrice, time: yyyymmddampm}), JSON.stringify({name: "updateNo"}));
    })
    replyMessage(e, `${displayTimeMessage}として株価${stockPrice}ベルを記録しただなも`);
}