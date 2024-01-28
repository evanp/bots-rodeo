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
      distributor
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
})
