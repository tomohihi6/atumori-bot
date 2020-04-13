'use strict'

const pg = require('pg')
const Pool = require

module.exports = class DB {
    constructor() {
        this.pool = new pg.Pool({
            connectionString: "postgres://bvdxhaaphbwqsn:bef32531d2e31379dd5619c78983e5d5550b547a23c929a2160252c9040c5a8f@ec2-52-87-58-157.compute-1.amazonaws.com:5432/d3lfet1hu3r5d3",
            ssl: true,
        })
    }

    async query(param) {
        const client = await this.pool.connect()
        const {row} = await client.query(param)
        client.release()
        return row
    }
}