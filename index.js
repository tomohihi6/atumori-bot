'use strict';

const line = require('@line/bot-sdk');
const express = require('express');
const router = express.Router();
const async = require('async');
const db = require('./database')

const { Client } = require('pg');

// create LINE SDK config from env variables
const config = {
  channelAccessToken: process.env.LINE_BOT_CHANNEL_TOKEN,
  channelSecret: process.env.LINE_BOT_CHANNEL_SECRET,
};

// create Express app
// about Express itself: https://expressjs.com/
const app = express();

// APIコールのためのクライアントインスタンスを作成
const client = new line.Client(config);

// register a webhook handler with middleware
// about the middleware, please refer to doc

//入力待ちかどうかを検出する
let waitAnswer = false;

app.post('/callback', line.middleware(config), (req, res) => {
    const dbclient = new Client({
        connectionString: process.env.DATABASE_URL,
      });
    res.sendStatus(200);

    // すべてのイベント処理のプロミスを格納する配列。
    let events_processed = [];

    //パターンにないメッセージが来た時にランダムに返信メッセージを決める
    function tempResponse(e, callback) {
        //おそらくプロフィール情報の取得に時間がかかってnameにundefindが入ることがあるので待つ
        getUserName(e.source.userId).then((name) => {
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
        }).catch(() => {
            console.log("失敗しました")
        })
    }

    function updateStockPrice(e) {
        console.log(e.postback.data);
        if(JSON.parse(e.postback.data).name == "updateStockPrice") {
            const stockPrice = JSON.parse(e.postback.data).stockP;
            const time = JSON.parse(e.postback.data).time;
            console.log(`株価は${stockPrice}`);
            dbclient.connect();
            dbclient.query(`UPDATE stock_price_tb SET stock_price='${stockPrice}' WHERE user_id='${e.source.userId}' AND time='${time}';`, 
            (err, res) => {
                if(err) {
                    console.log(err);
                    replyMessage(e, "データの記録に失敗しただなも");
                } else {
                    console.log("データアップデート完了");
                    console.log(res);
                    dbclient.end();
                    console.log("update client was closed");
                    replyMessage(e, "新しい株価を記録しただなも")
                }
            })
        } else if (JSON.parse(e.postback.data).name == "updateNo") {
            replyMessage(e, "わかっただなも");
        } 
    }

    function fecthFromDatabase(query) {
        return new Promise((resolve, reject) => {
            dbclient.connect().then((res) => {
                dbclient.query(query, (err, res) => {
                    if(err) {
                        console.log(err);
                        reject(err);
                    } else {
                        console.log("データベースクエリ完了");
                        console.log(res);
                        dbclient.end();
                        resolve(res);
                    }
                })
            })
        })
    }

    function replyMessage(e, param) {
        console.log(`${param}は正常に取得されています`);
        events_processed.push(client.replyMessage(e.replyToken, {
            type: "text",
            text: param
        }));
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

    // イベントオブジェクトを順次処理。
    req.body.events.forEach((event) => {
        if(waitAnswer) {
            if(event.message.text == "やっぱやめた") {
                replyMessage(evnet, "わかっただなも");
            } else {
                const userId = event.source.userId;
                const leftover = event.message.text;
                const query = `INSERT INTO leftover_tb (user_id, leftover) VALUES ('${userId}', '${leftover}');`;
                fecthFromDatabase(query)
                .then((res) => {
                    console.log(res);
                    replyMessage(event, "記録しただなも");
                }).catch((err) => {
                    console.log(err);
                    replyMessage(event, "記録に失敗しただなも");
                })
            }
            waitAnswer = false;
        } else {
            // この処理の対象をイベントタイプがメッセージで、かつ、テキストタイプだった場合に限定。
            if (event.type == "message" && event.message.type == "text"){
                //数字だけのテキストかどうかを判定
                let numFlug = true;
                for(let i = 0; i < event.message.text.length; i++) {
                    //1文字ずつアスキーコードを比較して数字判定
                    let charCode = event.message.text.charCodeAt(i);
                    if(charCode < 48  || charCode > 57){
                        numFlug = false;
                        //１つでも数字以外の文字が見つかった場合for文終わり
                        break;
                    }
                }
                if(numFlug) {
                    const stockPrice = event.message.text;
                    const userId = event.source.userId;
                    const yyyymmddampm = getCurrentTime();
                    const data = yyyymmddampm.split("/");
                    let x = "";
                    if (data[3] == "0") x = "午前"
                    else if(data[3] == "1") x = "午後"
                    const displayTimeMessage = yyyymmddampm.slice(0, -1) + x;

                    //株価を記録するためのSQL文
                    const query = `INSERT INTO stock_price_tb (user_id, stock_price, time) VALUES ('${userId}', '${stockPrice}', '${yyyymmddampm}');`;
                    
                    fecthFromDatabase(query)
                    .then((res) => {
                        replyMessage(event, `${displayTimeMessage}として株価${stockPrice}ベルを記録しただなも`);
                    }).catch((err) => {
                        replyConfirmTemplate(event, `今日の${x}の分の株価はすでに記録してあるだなも\n記録を上書きしてもいいだなもか？`, JSON.stringify({name: "updateStockPrice", stockP: stockPrice, time: yyyymmddampm}), JSON.stringify({name: "updateNo"}));
                    })

                    //数字以外のテキストの処理    
                } else {
                    switch (event.message.text) {
                        case "こんにちは":
                            events_processed.push(client.replyMessage(event.replyToken, {
                                type: "text",
                                text: "どうもだなも!"
                            }));
                            break;
        
                        case "今の時刻は？": {
                            var date = new Date()
                            var month = date.getMonth() + 1 ;
                            var day = date.getDate() ;
                            var hour = date.getHours() ;
                            var minute = date.getMinutes() ;
                            var dayOfWeek = date.getDay();
                            var dayOfWeekStr = [ "日", "月", "火", "水", "木", "金", "土" ][dayOfWeek] ;
                            const time = `今は${month}月${day}日の${dayOfWeekStr}曜日${hour}時${minute}分だなも`
                            events_processed.push(client.replyMessage(event.replyToken, {
                                type: "text",
                                text: time
                            }))
                            break;
                        }
        
                        case "しずえは？": {
                            events_processed.push(client.replyMessage(event.replyToken, {
                                type: "text",
                                text: "ノーコメントだなも"
                            }));
                            break;
                        }

                        case "株価一覧": {
                            const query = `SELECT time, stock_price FROM stock_price_tb WHERE user_id='${event.source.userId}' ORDER BY time ASC;`;
                            fecthFromDatabase(query)
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

                        case "最高値": {
                            const time = getCurrentTime();
                            const query = `SELECT user_id, stock_price FROM stock_price_tb WHERE time='${time}' ORDER BY stock_price DESC;`;
                            fecthFromDatabase(query)
                            .then((res) => {
                                const maxPrice = res.rows[0].stock_price;
                                getUserName(res.rows[0].user_id).then((name) => {
                                    console.log(`名前は${name}`);
                                    replyMessage(event, `今の時間の最高値は${name}さんの${maxPrice}ベルだなも!`);  
                                })
                            }).catch((err) => {
                                replyMessage(event, "株価最高値の取得に失敗しただなも");
                            })
                            break;
                        }

                        case "余り物記録" : {
                            replyMessage(event, "記録したい物の名前を入力して欲しいだなも");
                            waitAnswer = true;
                        }

                        case "帰って": {
                            if (event.message.text == "帰って") {
                                replyMessage(event, "ひどいだなも");
                                if (event.source.groupId !== null) {
                                    client.leaveGroup(event.source.groupId);
                                }
                            }
                            break;
                        } 
                        
                        case "余り物リスト": {
                            const query = `SELECT leftover FROM leftover_tb;`;
                            fecthFromDatabase(query)
                            .then((res) => {
                                let replyText = "";
                                res.rows.forEach((row) => {
                                    let leftover = row.leftover;
                                    replyText += `${leftover}\n`;
                                });
                                replyText = replyText.split(0, -1);
                                replyMessage(event, replyText);
                            }).catch((err) => {
                                console.log(err);
                                replyMessage(event, "余り物リスト取得に失敗しただなも");
                            })
                            break;
                        }
                        
                        default :
                            tempResponse(event, replyMessage)
                            break;
                            
                    }
                }
            } else if(event.type == "postback") {
                updateStockPrice(event);
            }
        }
  
        console.log(req.body);
        console.log(req.body.events[0].source)
    });
            // すべてのイベント処理が終了したら何個のイベントが処理されたか出力。
            Promise.all(events_processed).then(
                (response) => {
                    console.log(`${response.length} event(s) processed.`);
                }
            );
});

// event handler
function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    // ignore non-text-message event
    return Promise.resolve(null);
  }

  // create a echoing text message
  const echo = { type: 'text', text: event.message.text };

  // use reply API
  return client.replyMessage(event.replyToken, echo);
}

function getUserName(userID) {
    return new Promise(function(resolve, reject) {
        const userId = userID;
        client.getProfile(userId)
        .then((profile) => {
            resolve(profile.displayName)
        }).catch((err) => {
            reject(err);
        })
    })
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


// listen on port
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`listening on ${port}`);
});