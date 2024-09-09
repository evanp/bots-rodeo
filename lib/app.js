import { Sequelize } from 'sequelize'
import express from 'express'
import { ActivityDistributor } from './activitydistributor.js'
import { ActivityPubClient } from './activitypubclient.js'
import { ActorStorage } from './actorstorage.js'
import { BotDataStorage } from './botdatastorage.js'
import { KeyStorage } from './keystorage.js'
import { ObjectStorage } from './objectstorage.js'
import { UrlFormatter } from './urlformatter.js'
import { HTTPSignature } from './signaturevalidator.js'
import { Authorizer } from './authorizer.js'
import serverRouter from './routes/server.js'
import userRouter from './routes/user.js'
import objectRouter from './routes/object.js'
import collectionRouter from './routes/collection.js'
import { RemoteKeyStorage } from './remotekeystorage.js'
import Logger from 'pino'
import HTTPLogger from 'pino-http'
import http from 'node:http'

export async function makeApp (databaseUrl, origin, bots) {
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
  const remoteKeyStorage = new RemoteKeyStorage(client, connection)
  await remoteKeyStorage.initialize()
  const signature = new HTTPSignature(remoteKeyStorage)
  const distributor = new ActivityDistributor(
    client,
    formatter,
    actorStorage
  )
  const authorizer = new Authorizer(actorStorage, formatter, client)
  const logger = Logger()
  app.locals = {
    connection,
    formatter,
    actorStorage,
    botDataStorage,
    keyStorage,
    objectStorage,
    remoteKeyStorage,
    client,
    distributor,
    signature,
    logger,
    authorizer,
    bots
  }

  app.use(HTTPLogger({
    logger,
    level: process.env.NODE_ENV === 'test' ? 'silent' : 'info'
  }))
  app.use(signature.authenticate.bind(signature))

  app.use('/', serverRouter)
  app.use('/', userRouter)
  app.use('/', collectionRouter)
  app.use('/', objectRouter)

  app.use((err, req, res, next) => {
    let status = 500
    if (err.status) {
      status = err.status
    }
    const title = (http.STATUS_CODES[status])
      ? http.STATUS_CODES[status]
      : 'Unknown Status'

    res.status(status)
    res.type('application/problem+json')
    res.json({ type: 'about:blank', title, status, detail: err.message })
  })

  return app
}
