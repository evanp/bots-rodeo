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
  let botId = null
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
    logger = Logger({ level: 'debug' })
    botId = formatter.format({ username: 'ok' })
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
        content: 'Hello, world!',
        to: 'as:Public'
      },
      to: 'as:Public'
    })
    await facade.handleCreate(activity)
    const cached = await cache.get(activity.object?.first.id)
    assert.equal(cached.content, 'Hello, world!')
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
        content: 'Reply note',
        to: 'as:Public'
      },
      to: 'as:Public'
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
  it('can handle an update activity', async () => {
    const activity = await as2.import({
      type: 'Update',
      actor: 'https://social.example/user/remote1',
      id: 'https://social.example/user/remote1/update/1',
      object: {
        id: 'https://social.example/user/remote1/note/1',
        type: 'Note',
        content: 'Hello, world! (updated)',
        to: 'as:Public'
      },
      to: 'as:Public'
    })
    await facade.handleUpdate(activity)
    const cached = await cache.get(activity.object?.first.id)
    assert.equal(cached.content, 'Hello, world! (updated)')
  })
  it('can handle a delete activity', async () => {
    const activity = await as2.import({
      type: 'Delete',
      actor: 'https://social.example/user/remote1',
      id: 'https://social.example/user/remote1/delete/1',
      object: 'https://social.example/user/remote1/note/1',
      to: 'as:Public'
    })
    await facade.handleDelete(activity)
    const cached = await cache.get(activity.object?.first.id)
    assert.equal(cached, undefined)
  })
  it('can handle an add activity', async () => {
    const activity = await as2.import({
      type: 'Add',
      actor: 'https://social.example/user/remote1',
      id: 'https://social.example/user/remote1/add/1',
      object: {
        id: 'https://social.example/user/remote1/note/1',
        type: 'Note',
        attributedTo: 'https://social.example/user/remote1',
        to: 'as:Public'
      },
      target: {
        id: 'https://social.example/user/remote1/collection/1',
        type: 'Collection',
        attributedTo: 'https://social.example/user/remote1',
        to: 'as:Public'
      },
      to: 'as:Public'
    })
    await facade.handleAdd(activity)
    const cached = await cache.get(activity.object?.first.id)
    assert.equal(cached.id, activity.object?.first.id)
    const cached2 = await cache.get(activity.target?.first.id)
    assert.equal(cached2.id, activity.target?.first.id)
    assert.equal(
      true,
      await cache.isMember(activity.target?.first, activity.object?.first)
    )
  })

  it('can handle a remove activity', async () => {
    const activity = await as2.import({
      type: 'Remove',
      actor: 'https://social.example/user/remote1',
      id: 'https://social.example/user/remote1/remove/1',
      object: {
        id: 'https://social.example/user/remote1/note/1',
        type: 'Note',
        attributedTo: 'https://social.example/user/remote1',
        to: 'as:Public'
      },
      target: {
        id: 'https://social.example/user/remote1/collection/1',
        type: 'Collection',
        attributedTo: 'https://social.example/user/remote1',
        to: 'as:Public'
      },
      to: 'as:Public'
    })
    await facade.handleRemove(activity)
    const cached = await cache.get(activity.object?.first.id)
    assert.equal(cached.id, activity.object?.first.id)
    const cached2 = await cache.get(activity.target?.first.id)
    assert.equal(cached2.id, activity.target?.first.id)
    assert.equal(
      false,
      await cache.isMember(activity.target?.first, activity.object?.first)
    )
  })
  it('can handle a follow activity', async () => {
    const actor = await makeActor('follower1')
    assert.equal(
      false,
      await actorStorage.isInCollection('ok', 'followers', actor))
    const activity = await as2.import({
      type: 'Follow',
      id: 'https://social.example/user/follower1/follow/1',
      actor: actor.id,
      object: botId,
      to: botId
    })
    await facade.handleFollow(activity)
    assert.equal(
      true,
      await actorStorage.isInCollection('ok', 'followers', actor))
    await facade.onIdle()
    assert.equal(postInbox.follower1, 1)
  })
  it('can handle a duplicate follow activity', async () => {
    const actor = await makeActor('follower2')
    await actorStorage.addToCollection('ok', 'followers', actor)
    const activity = await as2.import({
      type: 'Follow',
      id: 'https://social.example/user/follower2/follow/2',
      actor: actor.id,
      object: botId,
      to: botId
    })
    await facade.handleFollow(activity)
    assert.equal(
      true,
      await actorStorage.isInCollection('ok', 'followers', actor))
    await facade.onIdle()
    assert.ok(!postInbox.follower2)
  })
  it('can handle a follow from a blocked account', async () => {
    const actor = await makeActor('follower3')
    await actorStorage.addToCollection('ok', 'blocked', actor)
    assert.strictEqual(
      false,
      await actorStorage.isInCollection('ok', 'followers', actor)
    )
    assert.strictEqual(
      true,
      await actorStorage.isInCollection('ok', 'blocked', actor)
    )
    const activity = await as2.import({
      type: 'Follow',
      id: 'https://social.example/user/follower3/follow/1',
      actor: actor.id,
      object: botId,
      to: botId
    })
    await facade.handleFollow(activity)
    assert.equal(
      false,
      await actorStorage.isInCollection('ok', 'followers', actor))
    await facade.onIdle()
    assert.ok(!postInbox.follower3)
  })
  it('can handle an accept activity', async () => {
    const actor = await makeActor('accepter1')
    const followActivity = await as2.import({
      type: 'Follow',
      id: 'https://botsrodeo.example/user/ok/follow/1',
      actor: botId,
      object: actor.id,
      to: actor.id
    })
    await objectStorage.create(followActivity)
    await actorStorage.addToCollection('ok', 'pendingFollowing', followActivity)
    assert.equal(
      false,
      await actorStorage.isInCollection('ok', 'following', actor))
    const activity = await as2.import({
      type: 'Accept',
      id: 'https://social.example/user/remote1/accept/1',
      actor: actor.id,
      object: followActivity.id,
      to: botId
    })
    await facade.handleAccept(activity)
    assert.equal(
      true,
      await actorStorage.isInCollection('ok', 'following', actor))
    assert.equal(
      false,
      await actorStorage.isInCollection('ok', 'pendingFollowing', followActivity))
  })
  it('can ignore an accept activity for a non-existing follow', async () => {
    const actor = await makeActor('accepter2')
    const activity = await as2.import({
      type: 'Accept',
      id: 'https://social.example/user/accepter2/accept/1',
      actor: actor.id,
      object: 'https://botsrodeo.example/user/ok/follow/69',
      to: botId
    })
    await facade.handleAccept(activity)
    assert.equal(
      false,
      await actorStorage.isInCollection('ok', 'following', actor))
  })
  it('can ignore an accept activity from a blocked account', async () => {
    const actor = await makeActor('accepter3')
    const followActivity = await as2.import({
      type: 'Follow',
      id: 'https://botsrodeo.example/user/ok/follow/3',
      actor: botId,
      object: actor.id,
      to: actor.id
    })
    await objectStorage.create(followActivity)
    await actorStorage.addToCollection('ok', 'pendingFollowing', followActivity)
    await actorStorage.addToCollection('ok', 'blocked', actor)
    const activity = await as2.import({
      type: 'Accept',
      id: 'https://social.example/user/accepter3/accept/1',
      actor: actor.id,
      object: followActivity.id,
      to: botId
    })
    await facade.handleAccept(activity)
    assert.equal(
      false,
      await actorStorage.isInCollection('ok', 'following', actor))
  })

  it('can ignore an accept activity for a remote follow activity', async () => {
    const actor = await makeActor('accepter4')
    const activity = await as2.import({
      type: 'Accept',
      id: 'https://social.example/user/accepter3/accept/1',
      actor: actor.id,
      object: {
        type: 'Follow',
        id: 'https://third.example/user/other/follow/3',
        actor: 'https://third.example/user/other',
        object: actor.id,
        to: [actor.id, 'as:Public']
      },
      to: ['https://third.example/user/other', 'as:Public']
    })
    await facade.handleAccept(activity)
    assert.equal(
      false,
      await actorStorage.isInCollection('ok', 'following', actor))
  })
  it('can ignore an accept activity for a follow of a different actor', async () => {
    const actor5 = await makeActor('accepter5')
    const actor6 = await makeActor('accepter6')
    const followActivity = await as2.import({
      type: 'Follow',
      id: 'https://botsrodeo.example/user/ok/follow/6',
      actor: botId,
      object: actor6.id,
      to: [actor6.id, 'as:Public']
    })
    await objectStorage.create(followActivity)
    await actorStorage.addToCollection('ok', 'pendingFollowing', followActivity)
    assert.equal(
      false,
      await actorStorage.isInCollection('ok', 'following', actor5))
    const activity = await as2.import({
      type: 'Accept',
      id: 'https://social.example/user/remote1/accept/1',
      actor: actor5.id,
      object: followActivity.id,
      to: [botId, 'as:Public']
    })
    await facade.handleAccept(activity)
    assert.equal(
      false,
      await actorStorage.isInCollection('ok', 'following', actor5))
    assert.equal(
      false,
      await actorStorage.isInCollection('ok', 'following', actor6))
    assert.equal(
      true,
      await actorStorage.isInCollection('ok', 'pendingFollowing', followActivity))
  })
  it('can ignore an accept activity for a follow by a different actor', async () => {
    const actor7 = await makeActor('accepter7')
    const followActivity = await as2.import({
      type: 'Follow',
      id: 'https://botsrodeo.example/user/calculon/follow/7',
      actor: 'https://botsrodeo.example/user/calculon',
      object: actor7.id,
      to: [actor7.id, 'as:Public']
    })
    await objectStorage.create(followActivity)
    await actorStorage.addToCollection('calculon', 'pendingFollowing', followActivity)
    assert.equal(
      false,
      await actorStorage.isInCollection('ok', 'following', actor7))
    const activity = await as2.import({
      type: 'Accept',
      id: 'https://social.example/user/accepter7/accept/7',
      actor: actor7.id,
      object: followActivity.id,
      to: [botId, 'as:Public']
    })
    await facade.handleAccept(activity)
    assert.equal(
      false,
      await actorStorage.isInCollection('ok', 'following', actor7))
    assert.equal(
      false,
      await actorStorage.isInCollection('calculon', 'following', actor7))
    assert.equal(
      true,
      await actorStorage.isInCollection('calculon', 'pendingFollowing', followActivity))
  })
})
