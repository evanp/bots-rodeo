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

  describe('GET non-existent user', async () => {
    let response = null
    it('should work without an error', async () => {
      response = await request(app).get('/user/dne')
    })
    it('should return 404 Not Found', async () => {
      assert.strictEqual(response.status, 404)
    })
    it('should return Problem Details JSON', async () => {
      assert.strictEqual(response.type, 'application/problem+json')
    })
    it('should return an object', async () => {
      assert.strictEqual(typeof response.body, 'object')
    })
    it('should return an object with a type', async () => {
      assert.strictEqual(typeof response.body.type, 'string')
    })
    it('should return an object with an type matching the request', async () => {
      assert.strictEqual(response.body.type, 'about:blank')
    })
    it('should return an object with a title', async () => {
      assert.strictEqual(typeof response.body.title, 'string')
    })
    it('should return an object with a title matching the request', async () => {
      assert.strictEqual(response.body.title, 'Not Found')
    })
    it('should return an object with a status', async () => {
      assert.strictEqual(typeof response.body.status, 'number')
    })
    it('should return an object with a status matching the request', async () => {
      assert.strictEqual(response.body.status, 404)
    })
    it('should return an object with a detail', async () => {
      assert.strictEqual(typeof response.body.detail, 'string')
    })
    it('should return an object with a detail matching the request', async () => {
      assert.strictEqual(response.body.detail, 'User dne not found')
    })
  })
})
