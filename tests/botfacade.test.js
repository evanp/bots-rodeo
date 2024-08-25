import { describe, it, before, after, beforeEach } from 'node:test'
import assert from 'node:assert'
import { BotFacade } from '../lib/botfacade.js'
import { Sequelize } from 'sequelize'
import { BotDataStorage } from '../lib/botdatastorage.js'
import { ObjectStorage } from '../lib/objectstorage.js'
import { KeyStorage } from '../lib/keystorage.js'
import { UrlFormatter } from '../lib/urlformatter.js'
import { ActivityPubClient } from '../lib/activitypubclient.js'
import { ActivityDistributor } from '../lib/activitydistributor.js'
import { ActorStorage } from '../lib/actorstorage.js'
import { Authorizer } from '../lib/authorizer.js'
import { ObjectCache } from '../lib/objectcache.js'
import as2 from 'activitystrea.ms'
import Logger from 'pino'
import nock from 'nock'
import bots from './fixtures/bots.js'

const makeActor = (username) =>
  as2.import({
    id: `https://social.example/user/${username}`,
    type: 'Person',
    preferredUsername: username,
    inbox: `https://social.example/user/${username}/inbox`,
    outbox: `https://social.example/user/${username}/outbox`,
    followers: `https://social.example/user/${username}/followers`,
    following: `https://social.example/user/${username}/following`,
    liked: `https://social.example/user/${username}/liked`
  })

const makeObject = (username, num) =>
  as2.import({
    id: `https://social.example/user/${username}/object/${num}`,
    type: 'Object',
    attributedTo: `https://social.example/user/${username}`,
    to: 'https://www.w3.org/ns/activitystreams#Public'
  })

describe('BotFacade', () => {
  let connection = null
  let botDataStorage = null
  let objectStorage = null
  let keyStorage = null
  let actorStorage = null
  let formatter = null
  let client = null
  let distributor = null
  let authz = null
  let cache = null
  let postInbox = {}
  let facade = null
  let logger = null
  before(async () => {
    formatter = new UrlFormatter('https://botsrodeo.example')
    connection = new Sequelize('sqlite::memory:', { logging: false })
    await connection.authenticate()
    botDataStorage = new BotDataStorage(connection)
    await botDataStorage.initialize()
    objectStorage = new ObjectStorage(connection)
    await objectStorage.initialize()
    keyStorage = new KeyStorage(connection)
    await keyStorage.initialize()
    actorStorage = new ActorStorage(connection, formatter)
    await actorStorage.initialize()
    client = new ActivityPubClient(keyStorage, formatter)
    distributor = new ActivityDistributor(client, formatter, actorStorage)
    authz = new Authorizer(actorStorage, formatter, client)
    cache = new ObjectCache({ longTTL: 3600 * 1000, shortTTL: 300 * 1000, maxItems: 1000 })
    logger = Logger()
    await objectStorage.create(await as2.import({
      id: formatter.format({ username: 'test1', type: 'object', nanoid: '_pEWsKke-7lACTdM3J_qd' }),
      type: 'Object',
      attributedTo: formatter.format({ username: 'test1' }),
      to: 'https://www.w3.org/ns/activitystreams#Public'
    }))
    nock('https://social.example')
      .get(/\/user\/(\w+)$/)
      .reply(async (uri, requestBody) => {
        const username = uri.match(/\/user\/(\w+)$/)[1]
        const actor = await makeActor(username)
        const actorText = await actor.write()
        return [200, actorText, { 'Content-Type': 'application/activity+json' }]
      })
      .persist()
      .post(/\/user\/(\w+)\/inbox$/)
      .reply(async (uri, requestBody) => {
        const username = uri.match(/\/user\/(\w+)\/inbox$/)[1]
        if (username in postInbox) {
          postInbox[username] += 1
        } else {
          postInbox[username] = 1
        }
        return [202, 'accepted']
      })
      .persist()
      .get(/\/user\/(\w+)\/object\/(\d+)$/)
      .reply(async (uri, requestBody) => {
        const match = uri.match(/\/user\/(\w+)\/object\/(\d+)$/)
        const username = match[1]
        const num = match[2]
        const obj = await makeObject(username, num)
        const objText = await obj.write()
        return [200, objText, { 'Content-Type': 'application/activity+json' }]
      })
  })
  after(async () => {
    await connection.close()
    facade = null
    cache = null
    authz = null
    distributor = null
    client = null
    formatter = null
    actorStorage = null
    keyStorage = null
    botDataStorage = null
    objectStorage = null
    connection = null
  })
  beforeEach(async () => {
    postInbox = {}
  })
  it('can initialize', async () => {
    const username = 'ok'
    const bot = bots[username]
    facade = new BotFacade(
      username,
      bot,
      actorStorage,
      objectStorage,
      distributor,
      formatter,
      cache,
      authz,
      logger
    )
    assert.ok(facade)
  })
  it('can handle a create activity', async () => {
    const activity = await as2.import({
      type: 'Create',
      actor: 'https://social.example/user/remote1',
      id: 'https://social.example/user/remote1/create/1',
      object: {
        id: 'https://social.example/user/remote1/note/1',
        type: 'Note',
        content: 'Hello, world!'
      }
    })
    await facade.handleCreate(activity)
    assert.ok(true)
  })
  it('can handle a create activity with a reply', async () => {
    const oid = formatter.format({
      username: 'ok',
      type: 'note',
      nanoid: 'k5MtHI1aGle4RocLqnw7x'
    })
    const original = await as2.import({
      id: oid,
      type: 'Note',
      attributedTo: formatter.format({ username: 'ok' }),
      to: 'https://www.w3.org/ns/activitystreams#Public',
      content: 'Original note'
    })
    await objectStorage.create(original)
    const activity = await as2.import({
      type: 'Create',
      actor: 'https://social.example/user/remote1',
      id: 'https://social.example/user/remote1/object/3',
      object: {
        inReplyTo: oid,
        id: 'https://social.example/user/remote1/object/4',
        type: 'Note',
        content: 'Reply note'
      }
    })
    const collection = await objectStorage.getCollection(oid, 'replies')
    assert.equal(collection.totalItems, 0)
    await facade.handleCreate(activity)
    const collection2 = await objectStorage.getCollection(oid, 'replies')
    assert.equal(collection2.totalItems, 1)
    await facade.onIdle()
    assert.equal(postInbox.remote1, 1)
    assert.ok(true)
  })
})
