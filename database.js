const {Pool} = require('pg');

exports.pool = new Pool({
    user: process.env.ENV_USER,
    host: process.env.ENV_HOST,
    databese: process.env.ENV_DB,
    password: process.env.ENV_PASSWORD,
    port: 5432,
})
