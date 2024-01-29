import { describe, it, before, after, beforeEach } from 'node:test'
import { ActorStorage } from '../lib/actorstorage.js'
import { Sequelize } from 'sequelize'
import { UrlFormatter } from '../lib/urlformatter.js'
import as2 from 'activitystrea.ms'
import nock from 'nock'
import { KeyStorage } from '../lib/keystorage.js'
import { ActivityPubClient } from '../lib/activitypubclient.js'
import assert from 'node:assert'
import { ActivityDistributor } from '../lib/activitydistributor.js'

describe('ActivityDistributor', () => {
  let connection = null
  let actorStorage = null
  let keyStorage = null
  let formatter = null
  let client = null
  let distributor = null
  let actor1 = null
  let actor2 = null
  let actor3 = null
  let signature = null
  let digest = null
  let gotTest1 = 0
  let gotTest2 = 0
  let postedTest1Inbox = 0
  let postedTest2Inbox = 0
  before(async () => {
    formatter = new UrlFormatter('https://botsrodeo.example')
    connection = new Sequelize('sqlite::memory:', { logging: false })
    await connection.authenticate()
    actorStorage = new ActorStorage(connection, formatter)
    await actorStorage.initialize()
    keyStorage = new KeyStorage(connection)
    await keyStorage.initialize()
    client = new ActivityPubClient(keyStorage, formatter)
    actor1 = await as2.import({
      id: 'https://social.example/user/test1',
      type: 'Person',
      preferredUsername: 'test1',
      inbox: 'https://social.example/user/test1/inbox',
      outbox: 'https://social.example/user/test1/outbox',
      followers: 'https://social.example/user/test1/followers',
      following: 'https://social.example/user/test1/following',
      liked: 'https://social.example/user/test1/liked'
    })
    const actor1Text = await actor1.export()
    actor2 = await as2.import({
      id: 'https://other.example/user/test2',
      type: 'Person',
      preferredUsername: 'test2',
      inbox: 'https://other.example/user/test2/inbox',
      outbox: 'https://other.example/user/test2/outbox',
      followers: 'https://other.example/user/test2/followers',
      following: 'https://other.example/user/test2/following',
      liked: 'https://other.example/user/test2/liked'
    })
    const actor2Text = await actor2.export()
    actor3 = await as2.import({
      id: 'https://third.example/user/test3',
      type: 'Person',
      preferredUsername: 'test3',
      inbox: 'https://third.example/user/test3/inbox',
      outbox: 'https://third.example/user/test3/outbox',
      followers: 'https://third.example/user/test3/followers',
      following: 'https://third.example/user/test3/following',
      liked: 'https://third.example/user/test3/liked'
    })
    const actor3Text = await actor3.export()
    await actorStorage.addToCollection('test0', 'followers', actor2)
    await actorStorage.addToCollection('test0', 'followers', actor3)
    nock('https://social.example')
      .get('/user/test1')
      .reply(function (uri, requestBody) {
        gotTest1 += 1
        signature = this.req.headers.signature
        return [200, actor1Text,
          { 'Content-Type': 'application/activity+json' }]
      })
      .persist()
      .post('/user/test1/inbox')
      .reply(function (uri, requestBody) {
        postedTest1Inbox += 1
        signature = this.req.headers.signature
        digest = this.req.headers.digest
        return [202, 'accepted']
      })
      .persist()
    nock('https://other.example')
      .get('/user/test2')
      .reply(function (uri, requestBody) {
        gotTest2 += 1
        signature = this.req.headers.signature
        return [200, actor2Text,
          { 'Content-Type': 'application/activity+json' }]
      })
      .persist()
      .post('/user/test2/inbox')
      .reply(function (uri, requestBody) {
        postedTest2Inbox += 1
        signature = this.req.headers.signature
        digest = this.req.headers.digest
        return [202, 'accepted']
      })
      .persist()
    nock('https://third.example')
      .get('/user/test3')
      .reply(function (uri, requestBody) {
        return [200, actor3Text,
          { 'Content-Type': 'application/activity+json' }]
      })
      .persist()
      .post('/user/test3/inbox')
      .reply(function (uri, requestBody) {
        return [202, 'accepted']
      })
      .persist()
  })
  after(async () => {
    await connection.close()
    distributor = null
    client = null
    connection = null
    actorStorage = null
    keyStorage = null
    formatter = null
  })
  beforeEach(async () => {
    signature = null
    digest = null
    gotTest1 = 0
    gotTest2 = 0
    postedTest1Inbox = 0
    postedTest2Inbox = 0
  })
  it('can create an instance', () => {
    distributor = new ActivityDistributor(client, formatter, actorStorage)
    assert.ok(distributor instanceof ActivityDistributor)
  })
  it('can distribute an activity to a single recipient', async () => {
    const activity = await as2.import({
      id: 'https://botsrodeo.example/user/test0/intransitiveactivity/1',
      type: 'IntransitiveActivity',
      actor: 'https://botsrodeo.example/user/test0',
      to: ['https://social.example/user/test1']
    })
    await distributor.distribute(activity, 'test0')
    assert.equal(gotTest1, 1)
    assert.equal(postedTest1Inbox, 1)
    assert.equal(gotTest2, 0)
    assert.equal(postedTest2Inbox, 0)
    assert.ok(signature)
    assert.ok(digest)
    assert.match(signature, /^keyId="https:\/\/botsrodeo\.example\/user\/test0\/publickey",headers="\(request-target\) host date digest",signature=".*",algorithm="rsa-sha256"$/)
  })
  it('can distribute an activity to all followers', async () => {
    const activity = await as2.import({
      id: 'https://botsrodeo.example/user/test0/intransitiveactivity/2',
      type: 'IntransitiveActivity',
      actor: 'https://botsrodeo.example/user/test0',
      to: ['https://botsrodeo.example/user/test0/followers']
    })
    await distributor.distribute(activity, 'test0')
    assert.equal(gotTest1, 0)
    assert.equal(postedTest1Inbox, 0)
    assert.equal(gotTest2, 1)
    assert.equal(postedTest2Inbox, 1)
    assert.ok(signature)
    assert.ok(digest)
    assert.match(signature, /^keyId="https:\/\/botsrodeo\.example\/user\/test0\/publickey",headers="\(request-target\) host date digest",signature=".*",algorithm="rsa-sha256"$/)
  })
  it('can distribute an activity to the public', async () => {
    const activity = await as2.import({
      id: 'https://botsrodeo.example/user/test0/intransitiveactivity/3',
      type: 'IntransitiveActivity',
      actor: 'https://botsrodeo.example/user/test0',
      to: ['https://www.w3.org/ns/activitystreams#Public']
    })
    await distributor.distribute(activity, 'test0')
    assert.equal(gotTest1, 0)
    assert.equal(postedTest1Inbox, 0)
    assert.equal(gotTest2, 1)
    assert.equal(postedTest2Inbox, 1)
    assert.ok(signature)
    assert.ok(digest)
    assert.match(signature, /^keyId="https:\/\/botsrodeo\.example\/user\/test0\/publickey",headers="\(request-target\) host date digest",signature=".*",algorithm="rsa-sha256"$/)
  })
  it('can distribute an activity to an addressed actor and followers', async () => {
    const activity = await as2.import({
      id: 'https://botsrodeo.example/user/test0/intransitiveactivity/4',
      type: 'IntransitiveActivity',
      actor: 'https://botsrodeo.example/user/test0',
      to: ['https://social.example/user/test1'],
      cc: ['https://botsrodeo.example/user/test0/followers']
    })
    await distributor.distribute(activity, 'test0')
    assert.equal(gotTest1, 1)
    assert.equal(postedTest1Inbox, 1)
    assert.equal(gotTest2, 1)
    assert.equal(postedTest2Inbox, 1)
    assert.ok(signature)
    assert.ok(digest)
    assert.match(signature, /^keyId="https:\/\/botsrodeo\.example\/user\/test0\/publickey",headers="\(request-target\) host date digest",signature=".*",algorithm="rsa-sha256"$/)
  })
  it('can distribute an activity to an addressed actor and the public', async () => {
    const activity = await as2.import({
      id: 'https://botsrodeo.example/user/test0/intransitiveactivity/3',
      type: 'IntransitiveActivity',
      actor: 'https://botsrodeo.example/user/test0',
      to: ['https://social.example/user/test1'],
      cc: ['https://www.w3.org/ns/activitystreams#Public']
    })
    await distributor.distribute(activity, 'test0')
    assert.equal(gotTest1, 1)
    assert.equal(postedTest1Inbox, 1)
    assert.equal(gotTest2, 1)
    assert.equal(postedTest2Inbox, 1)
    assert.ok(signature)
    assert.ok(digest)
    assert.match(signature, /^keyId="https:\/\/botsrodeo\.example\/user\/test0\/publickey",headers="\(request-target\) host date digest",signature=".*",algorithm="rsa-sha256"$/)
  })
  it('only sends once to an addressed follower', async () => {
    const activity = await as2.import({
      id: 'https://botsrodeo.example/user/test0/intransitiveactivity/3',
      type: 'IntransitiveActivity',
      actor: 'https://botsrodeo.example/user/test0',
      to: ['https://other.example/user/test2'],
      cc: ['https://botsrodeo.example/user/test0/followers']
    })
    await distributor.distribute(activity, 'test0')
    assert.equal(gotTest1, 0)
    assert.equal(postedTest1Inbox, 0)
    assert.ok(gotTest2 > 0)
    assert.equal(postedTest2Inbox, 1)
    assert.ok(signature)
    assert.ok(digest)
    assert.match(signature, /^keyId="https:\/\/botsrodeo\.example\/user\/test0\/publickey",headers="\(request-target\) host date digest",signature=".*",algorithm="rsa-sha256"$/)
  })
  it('only sends once to an addressed follower for the public', async () => {
    const activity = await as2.import({
      id: 'https://botsrodeo.example/user/test0/intransitiveactivity/3',
      type: 'IntransitiveActivity',
      actor: 'https://botsrodeo.example/user/test0',
      to: ['https://other.example/user/test2'],
      cc: ['https://www.w3.org/ns/activitystreams#Public']
    })
    await distributor.distribute(activity, 'test0')
    assert.equal(gotTest1, 0)
    assert.equal(postedTest1Inbox, 0)
    assert.ok(gotTest2 > 0)
    assert.equal(postedTest2Inbox, 1)
    assert.ok(signature)
    assert.ok(digest)
    assert.match(signature, /^keyId="https:\/\/botsrodeo\.example\/user\/test0\/publickey",headers="\(request-target\) host date digest",signature=".*",algorithm="rsa-sha256"$/)
  })
})
