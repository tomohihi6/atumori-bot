'use strict'

const { Pool } = require('pg')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: true,
})

module.exports = class DB {
     getBooks = (request, response) => {
        pool.query('SELECT * FROM books', (error, results) => {
          if (error) {
            return console.error(error)
          }
          response.status(200).json(results.rows)
        })
      }
}