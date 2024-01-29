import { Sequelize } from 'sequelize'
import express from 'express'
import { ActivityDistributor } from './activitydistributor.js'
import { ActivityPubClient } from './activitypubclient.js'
import { ActorStorage } from './actorstorage.js'
import { BotDataStorage } from './botdatastorage.js'
import { KeyStorage } from './keystorage.js'
import { ObjectStorage } from './objectstorage.js'
import { UrlFormatter } from './urlformatter.js'
import as2 from 'activitystrea.ms'
import serverRouter from './routes/server.js'

export async function makeApp (databaseUrl, origin) {
  const app = express()
  const connection = new Sequelize(databaseUrl, { logging: false })
  const formatter = new UrlFormatter(origin)
  const actorStorage = new ActorStorage(connection, formatter)
  await actorStorage.initialize()
  const botDataStorage = new BotDataStorage(connection)
  await botDataStorage.initialize()
  const keyStorage = new KeyStorage(connection)
  await keyStorage.initialize()
  const objectStorage = new ObjectStorage(connection)
  await objectStorage.initialize()
  const client = new ActivityPubClient(keyStorage, formatter)
  const distributor = new ActivityDistributor(
    client,
    formatter,
    actorStorage
  )
  app.locals = {
    connection,
    formatter,
    actorStorage,
    botDataStorage,
    keyStorage,
    objectStorage,
    client,
    distributor
  }
  app.use(as2.Middleware)

  app.use('/', serverRouter)

  app.use((err, req, res, next) => {
    console.error(err)
    res.status(500)
    res.type('text/plain')
    res.send(err.message)
  })
  return app
}
