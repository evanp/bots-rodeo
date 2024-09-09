import express from 'express'
import as2 from 'activitystrea.ms'
import createHttpError from 'http-errors'

const router = express.Router()

router.get('/user/:username/:collection', async (req, res, next) => {
  const { username, collection } = req.params
  const { actorStorage, bots } = req.app.locals
  if (!(username in bots)) {
    return next(createHttpError(404, `User ${username} not found`))
  }
  if (collection === 'inbox') {
    return next(createHttpError(403, `No access to ${collection} collection`))
  }
  if (!['outbox', 'liked', 'followers', 'following'].includes(req.params.collection)) {
    return next(createHttpError(404,
      `No such collection ${collection} for user ${username}`))
  }
  const coll = await actorStorage.getCollection(username, collection)
  res.status(200)
  res.type(as2.mediaType)
  res.end(await coll.prettyWrite())
})

router.get('/user/:username/:collection/:n(\\d+)', async (req, res, next) => {
  const { username, collection, n } = req.params
  const { actorStorage, bots, authorizer } = req.app.locals
  if (!(username in bots)) {
    return next(createHttpError(404, `User ${username} not found`))
  }
  if (collection === 'inbox') {
    return next(createHttpError(403, `No access to ${collection} collection`))
  }
  if (!['outbox', 'liked', 'followers', 'following'].includes(collection)) {
    return next(createHttpError(404,
      `No such collection ${collection} for user ${username}`))
  }
  if (!await actorStorage.hasPage(username, collection, parseInt(n))) {
    return next(createHttpError(404, `No such page ${n} for collection ${collection} for user ${username}`))
  }
  const id = req.auth?.subject
  const remote = (id) ? await as2.import({ id }) : null
  const page = await actorStorage.getCollectionPage(
    username,
    collection,
    parseInt(n)
  )
  const exported = await page.export()
  if (['outbox', 'liked'].includes(req.params.collection)) {
    exported.items = await Promise.all(exported.items.filter((item) =>
      authorizer.canRead(remote, item)
    ))
  }
  res.status(200)
  res.type(as2.mediaType)
  res.end(JSON.stringify(exported))
})

export default router
