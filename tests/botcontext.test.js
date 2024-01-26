import {describe, it, before, after} from 'node:test'
import assert from 'node:assert'
import {BotContext} from '../lib/botcontext.js'
import {Sequelize} from 'sequelize'
import { BotDataStorage } from '../lib/botdatastorage.js'
import { ObjectStorage } from '../lib/objectstorage.js'

describe('BotContext', () => {
    let connection = null
    let botDataStorage = null
    let objectStorage = null
    let context = null
    before(async () => {
        connection = new Sequelize('sqlite::memory:', {logging: false})
        await connection.authenticate()
        botDataStorage = new BotDataStorage(connection)
        await botDataStorage.initialize()
        objectStorage = new ObjectStorage(connection)
        await objectStorage.initialize()
    })
    after(async () => {
        await connection.close()
        context = null
        botDataStorage = null
        objectStorage = null
        connection = null
    })
    it('can initialize', async () => {
        context = new BotContext('test1', botDataStorage, objectStorage)
    })
    it('can set a value', async () => {
        await context.setData('key1', 'value1')
    })
    it('can get a value', async () => {
        await context.getData('key1')
    })
    it('can delete a value', async () => {
        await context.deleteData('key1')
    })
})