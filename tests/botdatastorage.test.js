import { describe, before, after, it } from 'node:test'
import { BotDataStorage, NoSuchValueError } from '../lib/botdatastorage.js'
import assert from 'node:assert'
import { Sequelize } from 'sequelize'

describe('BotDataStorage', async () => {
  let connection = null
  before(async () => {
    connection = new Sequelize('sqlite::memory:', {logging: false})
    await connection.authenticate()
  })
  after(async () => {
    await connection.close()
  })
  it('can initialize', async () => {
    await BotDataStorage.initialize(connection)
  })
  it('can set a value', async () => {
    await BotDataStorage.set('test', 'key1', 'value1')
  })
  it('can get a value', async () => {
    const value = await BotDataStorage.get('test', 'key1')
    assert.equal(value, 'value1')
  })
  it('knows if a value exists', async () => {
    const flag = await BotDataStorage.has('test', 'key1')
    assert.ok(flag)
  })
  it('knows if a value does not exist', async () => {
    const flag = await BotDataStorage.has('test', 'nonexistent1')
    assert.ok(!flag)
  })
  it('raises an error on a non-existent value', async() => {
    try {
      const value = await BotDataStorage.get('test', 'nonexistent2')
      assert.fail('Did not raise an exception getting a nonexistent key')
    } catch (e) {
      assert.ok(e instanceof NoSuchValueError)
    }
  })
  it('can delete a value', async() => {
    await BotDataStorage.delete('test', 'key1')
  })
  it('knows if a value has been deleted', async () => {
    const flag = await BotDataStorage.has('test', 'key1')
    assert.ok(!flag)
  })
  it('raises an error on a deleted value', async() => {
    try {
      const value = await BotDataStorage.get('test', 'key1')
      assert.fail('Did not raise an exception getting a deleted key')
    } catch (e) {
      assert.ok(e instanceof NoSuchValueError)
    }
  })
  it('stores different data at different keys for the same bot', async() => {
    await BotDataStorage.set('test', 'key2', 'value2')
    await BotDataStorage.set('test', 'key3', 'value3')
    const value2 = await BotDataStorage.get('test', 'key2')
    const value3 = await BotDataStorage.get('test', 'key3')
    assert.notEqual(value2, value3)
  })
  it('stores different data at the same key for different bots', async() => {
    await BotDataStorage.set('test2', 'key4', 'value4')
    await BotDataStorage.set('test3', 'key4', 'value5')
    const value4 = await BotDataStorage.get('test2', 'key4')
    const value5 = await BotDataStorage.get('test3', 'key4')
    assert.notEqual(value4, value5)
  })
  it('can store numbers', async () => {
    await BotDataStorage.set('test', 'numberkey1', 23)
    const value = await BotDataStorage.get('test', 'numberkey1')
    assert.equal(value, 23)
  })
  it('can store arrays', async () => {
    await BotDataStorage.set('test', 'arraykey1', [1, 2, 3])
    const value = await BotDataStorage.get('test', 'arraykey1')
    assert.deepEqual(value, [1, 2, 3])
  })
  it('can store objects', async () => {
    await BotDataStorage.set('test', 'objectkey1', {a: 1, b: 2, c: 3})
    const value = await BotDataStorage.get('test', 'objectkey1')
    assert.deepEqual(value, {a: 1, b: 2, c: 3})
  })
  it('can terminate', async () => {
    await BotDataStorage.terminate()
  })
})