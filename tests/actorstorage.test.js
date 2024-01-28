import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import { ActorStorage } from '../lib/actorstorage.js'
import { Sequelize } from 'sequelize'
import { UrlFormatter } from '../lib/urlformatter.js'
import as2 from 'activitystrea.ms'
import { promisify } from 'node:util'

const as2import = promisify(as2.import)

describe('ActorStorage', () => {
  let connection = null
  let storage = null
  let formatter = null
  let other = null
  before(async () => {
    connection = new Sequelize('sqlite::memory:', { logging: false })
    await connection.authenticate()
    formatter = new UrlFormatter('https://botsrodeo.example')
    other = await as2import({
      id: 'https://social.example/user/test2',
      type: 'Person'
    })
  })
  after(async () => {
    await connection.close()
    connection = null
    formatter = null
  })
  it('can create an instance', () => {
    storage = new ActorStorage(connection, formatter)
    assert.ok(storage instanceof ActorStorage)
  })
  it('can initialize the storage', async () => {
    await storage.initialize()
  })
  it('can get an actor', async () => {
    const actor = await storage.getActor('test')
    assert.ok(actor)
    assert.ok(actor.id)
    assert.ok(actor.inbox)
    assert.ok(actor.outbox)
    assert.ok(actor.followers)
    assert.ok(actor.following)
    assert.ok(actor.liked)
  })
  it('can get an empty collection', async () => {
    const collection = await storage.getCollection('test', 'followers')
    assert.ok(collection)
    assert.strictEqual(collection.id, 'https://botsrodeo.example/user/test/followers')
    assert.strictEqual(collection.type, 'https://www.w3.org/ns/activitystreams#OrderedCollection')
    assert.strictEqual(collection.totalItems, 0)
    assert.ok(collection.first)
    assert.ok(collection.last)
  })
  it('can get an empty collection page', async () => {
    const page = await storage.getCollectionPage('test', 'followers', 1)
    assert.ok(page)
    assert.strictEqual(
      page.id,
      'https://botsrodeo.example/user/test/followers/page/1'
    )
    assert.strictEqual(page.type, 'https://www.w3.org/ns/activitystreams#OrderedCollectionPage')
    assert.strictEqual(
      page.partOf.id,
      'https://botsrodeo.example/user/test/followers'
    )
    assert.ok(!page.next)
    assert.ok(!page.prev)
  })
  it('can add to a collection', async () => {
    const collection = await storage.getCollection('test3', 'followers')
    assert.strictEqual(collection.totalItems, 0)
    await storage.addToCollection(
      'test3',
      'followers',
      other
    )
    const collection2 = await storage.getCollection('test3', 'followers')
    assert.strictEqual(collection2.totalItems, 1)
    const page = await storage.getCollectionPage('test3', 'followers', 1)
    assert.strictEqual(page.items.length, 1)
    assert.strictEqual(Array.from(page.items)[0].id, 'https://social.example/user/test2')
  })
  it('can remove from a collection', async () => {
    await storage.removeFromCollection(
      'test3',
      'followers',
      other
    )
    const collection2 = await storage.getCollection('test3', 'followers')
    assert.strictEqual(collection2.totalItems, 0)
    const page = await storage.getCollectionPage('test3', 'followers', 1)
    assert.ok(!page.items)
  })

  it('can add a lot of items a collection', async () => {
    for (let i = 0; i < 100; i++) {
      const other = await as2import({
        id: `https://social.example/user/foo/note/${i}`,
        type: 'Note',
        content: `Hello World ${i}`
      })
      await storage.addToCollection(
        'test4',
        'liked',
        other
      )
    }
    const collection = await storage.getCollection('test4', 'liked')
    assert.strictEqual(collection.totalItems, 100)
    const page = await storage.getCollectionPage('test4', 'liked', 3)
    assert.strictEqual(page.items.length, 20)
    assert.strictEqual(page.next.id, 'https://botsrodeo.example/user/test4/liked/page/2')
  })
})
