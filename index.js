'use strict';

const line = require('@line/bot-sdk');
const express = require('express');

// create LINE SDK config from env variables
const config = {
  channelAccessToken: process.env.LINE_BOT_CHANNEL_TOKEN,
  channelSecret: process.env.LINE_BOT_CHANNEL_SECRET,
};

// create LINE SDK client
const client = new line.Client(config);

// create Express app
// about Express itself: https://expressjs.com/
server.listen(process.env.PORT || 3000);


// -----------------------------------------------------------------------------
// ルーター設定
server.post('/callback', line.middleware(line_config), (req, res, next) => {
    res.sendStatus(200);
    console.log(req.body);
});