'use strict';

const line = require('@line/bot-sdk');
const express = require('express');
const async = require('async');
const { Client } = require('pg');

const dbClient = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: true,
});

dbClient.connect();

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

async function databaseTest() {
    dbClient.query('SELECT table_schema,table_name FROM information_schema.tables;', (err, res) => {
        if (err) throw err;
        for (let row of res.rows) {
          console.log(JSON.stringify(row));
        }
        dbClient.end();
      });

}

// register a webhook handler with middleware
// about the middleware, please refer to doc
app.post('/callback', line.middleware(config), (req, res) => {
    res.sendStatus(200);

    // すべてのイベント処理のプロミスを格納する配列。
    let events_processed = [];

    //パターンにないメッセージが来た時にランダムに返信メッセージを決める
    async function tempResponse(e) {
        //おそらくプロフィール情報の取得に時間がかかってnameにundefindが入ることがあるので待つ
        let name = await getUserName(e.source.userId);
        // console.log(`名前は${name}`)
        const tempTexts = [
            "会話実装めんどくさすぎてはげそうだなも!",
            "ぼくと話す前に早く借金返せだなも！",
            "だなも！",
            "今回の増築代金として，1000000ベル，ローンを組ませていただくだなも！",
            `ぼくに騙されて${name}さんが無人島ツアーに申し込んでくれたおかげで，人生勝ち組だなも`
        ]
        let random = Math.floor( Math.random() * tempTexts.length );
        events_processed.push(client.replyMessage(e.replyToken, {
            type: "text",
            text: tempTexts[random]
        }));  
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
                let date = new Date();
                let hour = date.getHours();
                let ampm = (hour < 12) ? "午前" : "午後";

                events_processed.push(client.replyMessage(event.replyToken, {
                    type: "text",
                    text: "株価を記録しただなも"
                }))

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
                        databaseTest().then(() => {console.log("データベースs成功")})
                        break;

                     default :
                        tempResponse(event).then(() => {console.log("イベント終了")})
                        break;
                        
                }
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

async function getUserName(userID) {
    const userId = userID;
    const pro = await client.getProfile(userId)
    return pro.displayName;
}

// listen on port
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`listening on ${port}`);
});