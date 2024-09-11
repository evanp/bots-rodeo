import { describe, it, before } from 'node:test'
import assert from 'node:assert'
import as2 from 'activitystrea.ms'
import request from 'supertest'

import { makeApp } from '../lib/app.js'

import { nockSetup, nockSignature, nockFormat } from './utils/nock.js'
import { makeDigest } from './utils/digest.js'
import bots from './fixtures/bots.js'

describe('routes.inbox', async () => {
  const host = 'botsrodeo.test'
  const origin = `https://${host}`
  const databaseUrl = 'sqlite::memory:'
  let app = null

  before(async () => {
    nockSetup('social.example')
    app = await makeApp(databaseUrl, origin, bots)
  })

  describe('can handle an incoming activity', async () => {
    const username = 'actor1'
    const path = '/user/ok/inbox'
    const url = `${origin}${path}`
    const date = new Date().toUTCString()
    const activity = await as2.import({
      type: 'Activity',
      actor: nockFormat({ username }),
      id: nockFormat({ username, type: 'activity' })
    })
    const body = await activity.write()
    const digest = makeDigest(body)
    const signature = await nockSignature({
      method: 'POST',
      username,
      url,
      digest,
      date
    })
    let response = null
    it('should work without an error', async () => {
      response = await request(app)
        .post(path)
        .send(body)
        .set('Signature', signature)
        .set('Date', date)
        .set('Host', host)
        .set('Digest', digest)
        .set('Content-Type', 'application/activity+json')
      assert.ok(response)
    })
    it('should return a 200 status', async () => {
      assert.strictEqual(response.status, 200)
    })
  })
})
