import { describe, it, before, after } from 'node:test'
import { Authorizer } from '../lib/authorizer.js'
import { ActorStorage } from '../lib/actorstorage.js'
import { Sequelize } from 'sequelize'
import { UrlFormatter } from '../lib/urlformatter.js'
import { ObjectStorage } from '../lib/objectstorage.js'
import as2 from 'activitystrea.ms'
import assert from 'node:assert/strict'
import { nanoid } from 'nanoid'

describe('Authorizer', () => {
  let authorizer = null
  let actorStorage = null
  let formatter = null
  let connection = null
  let objectStorage = null
  let actor1 = null
  let actor2 = null
  let actor3 = null
  let publicObject = null
  let followersOnlyObject = null
  let privateObject = null

  before(async () => {
    formatter = new UrlFormatter('https://botsrodeo.example')
    connection = new Sequelize('sqlite::memory:', { logging: false })
    await connection.authenticate()
    actorStorage = new ActorStorage(connection, formatter)
    await actorStorage.initialize()
    objectStorage = new ObjectStorage(connection)
    await objectStorage.initialize()
    actor1 = await actorStorage.getActor('test1')
    actor2 = await actorStorage.getActor('test2')
    await actorStorage.addToCollection(
      'test1',
      'followers',
      actor2
    )
    actor3 = await actorStorage.getActor('test3')
    publicObject = await as2.import({
      id: formatter.format({
        username: 'test1',
        type: 'object',
        nanoid: nanoid()
      }),
      type: 'Object',
      attributedTo: actor1.id,
      to: 'as:Public'
    })
    followersOnlyObject = await as2.import({
      id: formatter.format({
        username: 'test1',
        type: 'object',
        nanoid: nanoid()
      }),
      type: 'Object',
      attributedTo: actor1.id,
      to: formatter.format({
        username: 'test1',
        collection: 'followers'
      })
    })
    privateObject = await as2.import({
      id: formatter.format({
        username: 'test1',
        type: 'object',
        nanoid: nanoid()
      }),
      type: 'Object',
      attributedTo: actor1.id,
      to: actor2.id
    })
  })

  after(async () => {
    await connection.close()
    formatter = null
    actorStorage = null
    connection = null
    authorizer = null
    objectStorage = null
  })

  it('should be a class', async () => {
    assert.strictEqual(typeof Authorizer, 'function')
  })

  it('can be instantiated', async () => {
    try {
      authorizer = new Authorizer(actorStorage, formatter)
      assert.strictEqual(typeof authorizer, 'object')
    } catch (error) {
      assert.fail(error)
    }
  })

  it('can check the creator can read a public local object', async () => {
    assert.strictEqual(true, await authorizer.canRead(actor1, publicObject))
  })

  it('can check the creator can read a followers-only local object', async () => {
    assert.strictEqual(
      true,
      await authorizer.canRead(actor1, followersOnlyObject)
    )
  })

  it('can check the creator can read a private local object', async () => {
    assert.strictEqual(
      true,
      await authorizer.canRead(actor1, privateObject)
    )
  })

  it('can check if a local follower can read a public local object', async () => {
    assert.strictEqual(true, await authorizer.canRead(actor2, publicObject))
  })

  it('can check if a local follower can read a followers-only local object', async () => {
    assert.strictEqual(true, await authorizer.canRead(actor2, followersOnlyObject))
  })

  it('can check if a local addressee can read a private local object', async () => {
    assert.strictEqual(true, await authorizer.canRead(actor2, privateObject))
  })

  it('can check if a local non-follower can read a public local object', async () => {
    assert.strictEqual(true, await authorizer.canRead(actor3, publicObject))
  })

  it('can check if a local non-follower can read a followers-only local object', async () => {
    assert.strictEqual(false, await authorizer.canRead(actor3, followersOnlyObject))
  })

  it('can check if a local non-addressee can read a private local object', async () => {
    assert.strictEqual(false, await authorizer.canRead(actor3, privateObject))
  })

  it('can check if the null actor can read a public local object', async () => {
    assert.strictEqual(true, await authorizer.canRead(null, publicObject))
  })

  it('can check if the null actor can read a followers-only local object', async () => {
    assert.strictEqual(false, await authorizer.canRead(null, followersOnlyObject))
  })

  it('can check if the null actor can read a private local object', async () => {
    assert.strictEqual(false, await authorizer.canRead(null, privateObject))
  })
})
