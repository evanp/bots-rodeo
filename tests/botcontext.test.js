import { describe, it, before, after } from 'node:test'
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
import { promisify } from 'node:util'
import nock from 'nock'

const as2import = promisify(as2.import)
const as2export = (obj) => {
  return new Promise((resolve, reject) => {
    obj.export((err, doc) => {
      if (err) {
        reject(err)
      } else {
        resolve(doc)
      }
    })
  })
}
const as2write = (obj) => {
  return new Promise((resolve, reject) => {
    obj.write((err, doc) => {
      if (err) {
        reject(err)
      } else {
        resolve(doc)
      }
    })
  })
}

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
  before(async () => {
    connection = new Sequelize('sqlite::memory:', { logging: false })
    await connection.authenticate()
    botDataStorage = new BotDataStorage(connection)
    await botDataStorage.initialize()
    objectStorage = new ObjectStorage(connection)
    await objectStorage.initialize()
    keyStorage = new KeyStorage(connection)
    await keyStorage.initialize()
    actorStorage = new ActorStorage(connection)
    await actorStorage.initialize()
    formatter = new UrlFormatter('https://botsrodeo.example')
    client = new ActivityPubClient(keyStorage, formatter)
    distributor = new ActivityDistributor(client, formatter, actorStorage)
    await objectStorage.create(await as2import({
      id: formatter.format({ username: 'test1', type: 'object', nanoid: '_pEWsKke-7lACTdM3J_qd' }),
      type: 'Object',
      attributedTo: formatter.format({ username: 'test1' }),
      to: 'https://www.w3.org/ns/activitystreams#Public'
    }))
    const object = await as2import({
      id: 'https://social.example/users/test2/object/1',
      type: 'Object',
      attributedTo: 'https://social.example/users/test2',
      to: 'https://www.w3.org/ns/activitystreams#Public'
    })
    const objectText = await as2write(object)
    nock('https://social.example')
      .get('/users/test2/object/1')
      .reply(200, objectText, { 'Content-Type': 'application/activity+json' })
      .persist()
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
    const id = 'https://social.example/users/test2/object/1'
    const object = await context.getObject(id)
    assert.ok(object)
    assert.strictEqual(object.id, id)
    assert.strictEqual(object.type, 'https://www.w3.org/ns/activitystreams#Object')
  })
})
