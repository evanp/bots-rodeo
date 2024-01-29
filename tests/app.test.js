import { describe, it } from 'node:test'
import assert from 'node:assert'
import { makeApp } from '../lib/app.js'
import request from 'supertest'

describe('app', async () => {
  const databaseUrl = 'sqlite::memory:'
  const origin = 'https://botsrodeo.test'
  let app = null
  it('should be a function', async () => {
    assert.strictEqual(typeof makeApp, 'function')
  })
  it('should return a function', async () => {
    app = await makeApp(databaseUrl, origin)
    assert.strictEqual(typeof app, 'function')
  })
  describe('GET /', async () => {
    let response = null
    it('should work without an error', async () => {
      response = await request(app).get('/')
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
    it('should return an object with an id matching the origin', async () => {
      assert.strictEqual(response.body.id, origin + '/')
    })
    it('should return an object with a publicKey', { skip: true }, async () => {
      assert.strictEqual(typeof response.body.publicKey, 'string')
    })
  })
  describe('GET /publickey', async () => {
    let response = null
    it('should work without an error', async () => {
      response = await request(app).get('/publickey')
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
    it('should return an object with an id matching the origin', async () => {
      assert.strictEqual(response.body.id, origin + '/publickey')
    })
    it('should return an object with an owner', { skip: true }, async () => {
      assert.strictEqual(typeof response.body.owner, 'string')
    })
    it('should return an object with the origin as owner', { skip: true }, async () => {
      assert.strictEqual(response.body.owner, origin + '/')
    })
    it('should return an object with a publicKeyPem', { skip: true }, async () => {
      assert.strictEqual(typeof response.body.publicKeyPem, 'string')
    })
    it('publicKeyPem should be an RSA PKCS-8 key', { skip: true }, async () => {
      assert.match(response.body.publicKeyPem, /^-----BEGIN PUBLIC KEY-----\n/)
      assert.match(response.body.publicKeyPem, /\n-----END PUBLIC KEY-----$/)
    })
  })
})
