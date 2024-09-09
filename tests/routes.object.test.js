import { describe, it, before } from 'node:test'
import assert from 'node:assert'
import { makeApp } from '../lib/app.js'
import request from 'supertest'
import bots from './fixtures/bots.js'
import as2 from 'activitystrea.ms'
import { nockSetup } from './utils/nock.js'

describe('actor collection routes', async () => {
  const databaseUrl = 'sqlite::memory:'
  const origin = 'https://botsrodeo.test'
  const username = 'ok'
  const type = 'object'
  const nanoid = 'hUQC9HWian7dzOxZJlJBA'
  let app = null
  let obj = null

  before(async () => {
    app = await makeApp(databaseUrl, origin, bots)
    const { formatter, objectStorage } = app.locals
    await nockSetup('https://social.example')
    obj = await as2.import({
      id: formatter.format({ username, type, nanoid }),
      type,
      attributedTo: formatter.format({ username }),
      summaryMap: {
        en: 'Test object for the object collection routes'
      },
      replies: formatter.format({ username, type, nanoid, collection: 'replies' }),
      likes: formatter.format({ username, type, nanoid, collection: 'likes' }),
      shares: formatter.format({ username, type, nanoid, collection: 'shares' }),
      to: ['as:Public']
    })
    await objectStorage.create(obj)
  })

  describe('GET /user/{username}/{type}/{nanoid}', async () => {
    let response = null
    const url = `/user/${username}/${type}/${nanoid}`
    console.log(url)
    it('should work without an error', async () => {
      response = await request(app)
        .get(url)
    })
    it('should return a 200 status', async () => {
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
  })
})
