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

    function insertStockPrice(e, userId, stockPrice) {
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
        let ampm = (hour < 12) ? "0" : "1";
        let x = (ampm) ? "午後" : "午前";
        const displayTimeMessage = year + '/' + month + '/' + day + '/' + x;
        const yyyymmddampm = year + '/' + month + '/' + day + '/' + ampm;
        
        console.log(yyyymmddampm);
        dbclient.connect();
        dbclient.query(`INSERT INTO stock_price_tb (user_id, stock_price, time) VALUES ('${userId}', '${stockPrice}', '${yyyymmddampm}');`, (err, res) => {
            if (err) {
                console.log(err);
                console.log("エラー起こってるで")
                dbclient.end();
                replyConfirmTemplate(e, `今日の${x}の分の株価はすでに記録してあるだなも\n記録を上書きしてもいいだなもか？`, JSON.stringify({name: "updateStockPrice", stockP: stockPrice}), "no");
            }
            else {
                console.log("データはインサートしてるみたい")
                console.log(res)
                dbclient.end();
                console.log("insert client was closed")
                replyMessage(e, `${displayTimeMessage}として株価${stockPrice}を記録しただなも`);
            }
            
        });
    }

    function updateStockPrice(e) {
        console.log(e.postback.data);
        if(e.postback.data.name == "updateStockPrice") {
            const stockPrice = e.postback.data.stockP;
            console.log(`株価は${stockPrice}`);
            dbclient.connect();
            dbclient.query(`UPDATE stock_price_tb SET stock_price='${stockPrice}';`, 
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
        } else if (e.postback.data == "no") {
            replyMessage(e, "わかっただなも");
        } 
        
    }


    function databaseACCESS(e, callback) {
        //データベースに接続
        dbclient.connect().then((res) => {
            console.log(res);
            let save;
            //データベースの命令文（クエリ）をデータベースに送るための文
            dbclient.query('SELECT * FROM  stock_price_tb', callback, (err, res)=> {
                if (err) console.error(err);
                for (let row of res.rows) {
                    console.log(row);
                    save = row
                }
                dbclient.end()
                console.log(`select client was closed`)
                callback(e, save.user_id);
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
                insertStockPrice(event, event.source.userId, event.message.text,);

                //数字以外のテキストの処理    
            } else {
                switch (event.message.text) {
                    case "こんにちは":
                        events_processed.push(client.replyMessage(event.replyToken, {
                            type: "text",
                            text: "どうもだなも!"
                        }));
                        break;
    
                    case "今の時刻は？":
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
    
                    case "しずえは？":
                        events_processed.push(client.replyMessage(event.replyToken, {
                            type: "text",
                            text: "ノーコメントだなも"
                        }));
                        break;
                    
                    case "データベース":
                        databaseACCESS(event, replyMessage)
                        break;    
                    
                     default :
                        tempResponse(event, replyMessage)
                        break;
                        
                }
            }
        } else if(event.type == "postback") {
            updateStockPrice(event);
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
        client.getProfile(userId).then((profile) => {
            resolve(profile.displayName)
        })
    })
}

function getCurrentTime() {
    const date = new Date();
}

// listen on port
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`listening on ${port}`);
});