import { describe, before, after, it, beforeEach } from 'node:test'
import { KeyStorage } from '../lib/keystorage.js'
import { UrlFormatter } from '../lib/urlformatter.js'
import { ActivityPubClient } from '../lib/activitypubclient.js'
import assert from 'node:assert'
import { Sequelize } from 'sequelize'
import nock from 'nock'
import as2 from 'activitystrea.ms'

describe('ActivityPubClient', async () => {
  let connection = null
  let keyStorage = null
  let formatter = null
  let client = null
  let note = null
  let signature = null
  let digest = null
  before(async () => {
    connection = new Sequelize('sqlite::memory:', { logging: false })
    await connection.authenticate()
    keyStorage = new KeyStorage(connection)
    await keyStorage.initialize()
    formatter = new UrlFormatter('https://botsrodeo.example')
    note = await as2.note()
      .id('https://social.example/users/evan/note/1')
      .attributedTo(
        await as2.person()
          .id('https://social.example/users/evan')
          .name('Evan Prodromou')
          .get())
      .to(
        await as2.collection()
          .id('https://www.w3.org/ns/activitystreams#Public')
          .get())
      .summary('A note by Evan Prodromou')
      .content('Hello World')
      .publishedNow()
      .get()
    const noteText = await note.prettyWrite()
    nock('https://social.example')
      .get('/users/evan/note/1')
      .reply(function (uri, requestBody) {
        signature = this.req.headers.signature
        return [200, noteText, { 'Content-Type': 'application/activity+json' }]
      })
      .persist()
      .post('/users/evan/inbox')
      .reply(function (uri, requestBody) {
        signature = this.req.headers.signature
        digest = this.req.headers.digest
        return [202, 'accepted']
      })
      .persist()
  })
  after(async () => {
    await connection.close()
    keyStorage = null
    connection = null
  })
  beforeEach(async () => {
    signature = null
    digest = null
  })
  it('can initialize', () => {
    client = new ActivityPubClient(keyStorage, formatter)
  })
  it('can get a remote object with a username', async () => {
    const obj = await client.get('https://social.example/users/evan/note/1', 'foobot')
    assert.ok(obj)
    assert.equal(typeof obj, 'object')
    assert.equal(obj.id, note.id)
    assert.ok(signature)
    assert.match(signature, /^keyId="https:\/\/botsrodeo\.example\/user\/foobot\/publickey",headers="\(request-target\) host date",signature=".*",algorithm="rsa-sha256"$/)
  })
  it('can get a remote object without a username', async () => {
    const obj = await client.get('https://social.example/users/evan/note/1')
    assert.ok(obj)
    assert.equal(typeof obj, 'object')
    assert.equal(obj.id, note.id)
    assert.ok(signature)
    assert.match(signature, /^keyId="https:\/\/botsrodeo\.example\/publickey",headers="\(request-target\) host date",signature=".*",algorithm="rsa-sha256"$/)
  })
  it('can deliver an activity', async () => {
    const obj = as2.follow()
      .actor('https://botsrodeo.example/user/foobot')
      .object('https://social.example/users/evan')
      .to('https://social.example/users/evan')
      .publishedNow()
      .get()
    await client.post('https://social.example/users/evan/inbox', obj, 'foobot')
    assert.ok(signature)
    assert.ok(digest)
    assert.match(signature, /^keyId="https:\/\/botsrodeo\.example\/user\/foobot\/publickey",headers="\(request-target\) host date digest",signature=".*",algorithm="rsa-sha256"$/)
  })
})
