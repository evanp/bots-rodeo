import { describe, it } from 'node:test'
import assert from 'node:assert'
import { makeApp } from '../lib/app.js'
import request from 'supertest'
import bots from './fixtures/bots.js'

describe('actor routes', async () => {
  const databaseUrl = 'sqlite::memory:'
  const origin = 'https://botsrodeo.test'
  const app = await makeApp(databaseUrl, origin, bots)

  describe('GET /user/{botid}', async () => {
    let response = null
    it('should work without an error', async () => {
      response = await request(app).get('/user/ok')
    })
    it('should return 200 OK', async () => {
      assert.strictEqual(response.status, 200)
    })
    it('should return AS2', async () => {
      assert.strictEqual(response.type, 'application/activity+json')
    })
    it('should return an object', async () => {
      assert.strictEqual(typeof response.body, 'object')
    })
    it('should return an object with an id', async () => {
      assert.strictEqual(typeof response.body.id, 'string')
    })
    it('should return an object with an id matching the request', async () => {
      assert.strictEqual(response.body.id, origin + '/user/ok')
    })
  })
})
