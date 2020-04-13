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
            throw error
          }
          console.log(results.rows)
          response.status(200).json(results.rows)
        })
      }
}