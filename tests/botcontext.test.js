import { describe, it, before, after, beforeEach } from 'node:test'
import assert from 'node:assert'
import { BotContext } from '../lib/botcontext.js'
import { Sequelize } from 'sequelize'
import { BotDataStorage } from '../lib/botdatastorage.js'
import { ObjectStorage } from '../lib/objectstorage.js'
import { KeyStorage } from '../lib/keystorage.js'
import { UrlFormatter } from '../lib/urlformatter.js'
import { ActivityPubClient } from '../lib/activitypubclient.js'
import { ActivityDistributor } from '../lib/activitydistributor.js'
import { ActorStorage } from '../lib/actorstorage.js'
import as2 from 'activitystrea.ms'
import nock from 'nock'

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

describe('BotContext', () => {
  let connection = null
  let botDataStorage = null
  let objectStorage = null
  let keyStorage = null
  let actorStorage = null
  let formatter = null
  let client = null
  let distributor = null
  let context = null
  let postInbox = {}
  let actor3 = null
  let actor5 = null
  let actor6 = null
  let note = null
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
    context = null
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
    context = new BotContext(
      'test1',
      botDataStorage,
      objectStorage,
      actorStorage,
      client,
      distributor,
      formatter
    )
  })
  it('can get the bot ID', () => {
    assert.strictEqual(context.botId, 'test1')
  })
  it('can set a value', async () => {
    await context.setData('key1', 'value1')
  })
  it('can get a value', async () => {
    const value = await context.getData('key1')
    assert.equal(value, 'value1')
  })
  it('can delete a value', async () => {
    await context.deleteData('key1')
  })
  it('can get a local object', async () => {
    const id = formatter.format({ username: 'test1', type: 'object', nanoid: '_pEWsKke-7lACTdM3J_qd' })
    const object = await context.getObject(id)
    assert.ok(object)
    assert.strictEqual(object.id, id)
    assert.strictEqual(object.type, 'https://www.w3.org/ns/activitystreams#Object')
  })
  it('can get a remote object', async () => {
    const id = 'https://social.example/user/test2/object/1'
    const object = await context.getObject(id)
    assert.ok(object)
    assert.strictEqual(object.id, id)
    assert.strictEqual(object.type, 'https://www.w3.org/ns/activitystreams#Object')
  })
  it('can send a note', async () => {
    const actor2 = await makeActor('test2')
    await actorStorage.addToCollection('test1', 'followers', actor2)
    let followers = await actorStorage.getCollection('test1', 'followers')
    assert.strictEqual(followers.totalItems, 1)
    const content = 'Hello World'
    const to = 'https://www.w3.org/ns/activitystreams#Public'
    note = await context.sendNote(content, { to })
    assert.ok(note)
    assert.strictEqual(postInbox.test2, 1)
    const outbox = await actorStorage.getCollection('test1', 'outbox')
    assert.strictEqual(outbox.totalItems, 1)
    const inbox = await actorStorage.getCollection('test1', 'inbox')
    assert.strictEqual(inbox.totalItems, 1)
    followers = await actorStorage.getCollection('test1', 'followers')
    assert.strictEqual(followers.totalItems, 1)
  })
  it('can like an object', async () => {
    const id = 'https://social.example/user/test2/object/1'
    const obj = await context.getObject(id)
    await context.likeObject(obj)
    assert.strictEqual(postInbox.test2, 1)
    const outbox = await actorStorage.getCollection('test1', 'outbox')
    assert.strictEqual(outbox.totalItems, 2)
    const inbox = await actorStorage.getCollection('test1', 'inbox')
    assert.strictEqual(inbox.totalItems, 2)
    const liked = await actorStorage.getCollection('test1', 'liked')
    assert.strictEqual(liked.totalItems, 1)
  })
  it('can unlike an object', async () => {
    const id = 'https://social.example/user/test2/object/1'
    const obj = await context.getObject(id)
    await context.unlikeObject(obj)
    assert.strictEqual(postInbox.test2, 1)
    const outbox = await actorStorage.getCollection('test1', 'outbox')
    assert.strictEqual(outbox.totalItems, 3)
    const inbox = await actorStorage.getCollection('test1', 'inbox')
    assert.strictEqual(inbox.totalItems, 3)
    const liked = await actorStorage.getCollection('test1', 'liked')
    assert.strictEqual(liked.totalItems, 0)
  })
  it('can follow an actor', async () => {
    actor3 = await makeActor('test3')
    await context.followActor(actor3)
    assert.strictEqual(postInbox.test3, 1)
    const outbox = await actorStorage.getCollection('test1', 'outbox')
    assert.strictEqual(outbox.totalItems, 4)
    const inbox = await actorStorage.getCollection('test1', 'inbox')
    assert.strictEqual(inbox.totalItems, 4)
    const pendingFollowing = await actorStorage.getCollection('test1', 'pendingFollowing')
    assert.strictEqual(pendingFollowing.totalItems, 1)
  })
  it('can unfollow a pending actor', async () => {
    await context.unfollowActor(actor3)
    assert.strictEqual(postInbox.test3, 1)
    const outbox = await actorStorage.getCollection('test1', 'outbox')
    assert.strictEqual(outbox.totalItems, 5)
    const inbox = await actorStorage.getCollection('test1', 'inbox')
    assert.strictEqual(inbox.totalItems, 5)
    const pendingFollowing = await actorStorage.getCollection('test1', 'pendingFollowing')
    assert.strictEqual(pendingFollowing.totalItems, 0)
  })
  it('can unfollow a followed actor', async () => {
    const actor4 = await makeActor('test4')
    await actorStorage.addToCollection('test1', 'following', actor4)
    let following = await actorStorage.getCollection('test1', 'following')
    assert.strictEqual(following.totalItems, 1)
    await context.unfollowActor(actor4)
    assert.strictEqual(postInbox.test4, 1)
    const outbox = await actorStorage.getCollection('test1', 'outbox')
    assert.strictEqual(outbox.totalItems, 6)
    const inbox = await actorStorage.getCollection('test1', 'inbox')
    assert.strictEqual(inbox.totalItems, 6)
    following = await actorStorage.getCollection('test1', 'following')
    assert.strictEqual(following.totalItems, 0)
  })
  it('can block an actor without a relationship', async () => {
    let followers = await actorStorage.getCollection('test1', 'followers')
    assert.strictEqual(followers.totalItems, 1)
    actor5 = await makeActor('test5')
    await context.blockActor(actor5)
    assert.ok(!postInbox.test5)
    const outbox = await actorStorage.getCollection('test1', 'outbox')
    assert.strictEqual(outbox.totalItems, 7)
    const inbox = await actorStorage.getCollection('test1', 'inbox')
    assert.strictEqual(inbox.totalItems, 7)
    const blocked = await actorStorage.getCollection('test1', 'blocked')
    assert.strictEqual(blocked.totalItems, 1)
    followers = await actorStorage.getCollection('test1', 'followers')
    assert.strictEqual(followers.totalItems, 1)
  })
  it('can unblock an actor without a relationship', async () => {
    let followers = await actorStorage.getCollection('test1', 'followers')
    assert.strictEqual(followers.totalItems, 1)
    await context.unblockActor(actor5)
    assert.ok(!postInbox.test5)
    const outbox = await actorStorage.getCollection('test1', 'outbox')
    assert.strictEqual(outbox.totalItems, 8)
    const inbox = await actorStorage.getCollection('test1', 'inbox')
    assert.strictEqual(inbox.totalItems, 8)
    const blocked = await actorStorage.getCollection('test1', 'blocked')
    assert.strictEqual(blocked.totalItems, 0)
    followers = await actorStorage.getCollection('test1', 'followers')
    assert.strictEqual(followers.totalItems, 1)
  })
  it('can block an actor with a relationship', async () => {
    actor6 = await makeActor('test6')
    let followers = await actorStorage.getCollection('test1', 'followers')
    assert.strictEqual(followers.totalItems, 1)
    await actorStorage.addToCollection('test1', 'following', actor6)
    await actorStorage.addToCollection('test1', 'followers', actor6)
    followers = await actorStorage.getCollection('test1', 'followers')
    assert.strictEqual(followers.totalItems, 2)
    await context.blockActor(actor6)
    assert.ok(!postInbox.test6)
    const outbox = await actorStorage.getCollection('test1', 'outbox')
    assert.strictEqual(outbox.totalItems, 9)
    const inbox = await actorStorage.getCollection('test1', 'inbox')
    assert.strictEqual(inbox.totalItems, 9)
    const blocked = await actorStorage.getCollection('test1', 'blocked')
    assert.strictEqual(blocked.totalItems, 1)
    const following = await actorStorage.getCollection('test1', 'following')
    assert.strictEqual(following.totalItems, 0)
    followers = await actorStorage.getCollection('test1', 'followers')
    assert.strictEqual(followers.totalItems, 1)
  })
  it('can unblock an actor with a former relationship', async () => {
    await context.unblockActor(actor6)
    assert.ok(!postInbox.test6)
    const outbox = await actorStorage.getCollection('test1', 'outbox')
    assert.strictEqual(outbox.totalItems, 10)
    const inbox = await actorStorage.getCollection('test1', 'inbox')
    assert.strictEqual(inbox.totalItems, 10)
    const blocked = await actorStorage.getCollection('test1', 'blocked')
    assert.strictEqual(blocked.totalItems, 0)
    const following = await actorStorage.getCollection('test1', 'following')
    assert.strictEqual(following.totalItems, 0)
    const followers = await actorStorage.getCollection('test1', 'followers')
    assert.strictEqual(followers.totalItems, 1)
  })
  it('can update a note', async () => {
    const content = 'Hello World 2'
    await context.updateNote(note, content)
    assert.strictEqual(postInbox.test2, 1)
    const outbox = await actorStorage.getCollection('test1', 'outbox')
    assert.strictEqual(outbox.totalItems, 11)
    const inbox = await actorStorage.getCollection('test1', 'inbox')
    assert.strictEqual(inbox.totalItems, 11)
    const copy = await context.getObject(note.id)
    assert.strictEqual(copy.content.get(), content)
  })
  it('can delete a note', async () => {
    await context.deleteNote(note)
    assert.strictEqual(postInbox.test2, 1)
    const outbox = await actorStorage.getCollection('test1', 'outbox')
    assert.strictEqual(outbox.totalItems, 12)
    const inbox = await actorStorage.getCollection('test1', 'inbox')
    assert.strictEqual(inbox.totalItems, 12)
    const copy = await context.getObject(note.id)
    assert.ok(copy)
    assert.strictEqual(copy.type, 'https://www.w3.org/ns/activitystreams#Tombstone')
    assert.ok(copy.deleted)
    // FIXME: check for formerType when activitystrea.ms supports it
  })
})
