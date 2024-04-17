import express from 'express'
import as2 from 'activitystrea.ms'
import createHttpError from 'http-errors'

const router = express.Router()

router.get('/:username/:type/:nanoid', async (req, res) => {
  const { objectStorage, formatter, authorizer } = req.app.locals
  const id = formatter.format({ username: req.params.username, type: req.params.type, nanoid: req.params.nanoid })
  const object = await objectStorage.get(id)
  if (!object) {
    throw createHttpError(404, 'Not Found')
  }
  const remote = (req.auth?.subject) ? await as2.import({ id: req.auth.subject }) : null
  if (!authorizer.canRead(remote, object)) {
    throw createHttpError(403, 'Forbidden')
  }
  res.status(200)
  res.type(as2.mediaType)
  res.end(await object.prettyWrite())
})

router.get('/:username/:type/:nanoid/:collection', async (req, res) => {
  const { objectStorage, formatter, authorizer } = req.app.locals
  if (!['replies', 'likes', 'shares'].includes(req.params.collection)) {
    throw createHttpError(404, 'Not Found')
  }
  const id = formatter.format({ username: req.params.username, type: req.params.type, nanoid: req.params.nanoid })
  const object = await objectStorage.get(id)
  if (!object) {
    throw createHttpError(404, 'Not Found')
  }
  const remote = (req.auth?.subject) ? await as2.import({ id: req.auth.subject }) : null
  if (!authorizer.canRead(remote, object)) {
    throw createHttpError(403, 'Forbidden')
  }
  const collection = await objectStorage.getCollection(id, req.params.collection)
  res.status(200)
  res.type(as2.mediaType)
  res.end(await collection.prettyWrite())
})

router.get('/:username/:type/:nanoid/:collection/page/:n', async (req, res) => {
  const { objectStorage, formatter, authorizer } = req.app.locals
  if (!['replies', 'likes', 'shares'].includes(req.params.collection)) {
    throw createHttpError(404, 'Not Found')
  }
  const id = formatter.format({ username: req.params.username, type: req.params.type, nanoid: req.params.nanoid })
  const object = await objectStorage.get(id)
  if (!object) {
    throw createHttpError(404, 'Not Found')
  }
  const remote = (req.auth?.subject) ? await as2.import({ id: req.auth.subject }) : null
  if (!authorizer.canRead(remote, object)) {
    throw createHttpError(403, 'Forbidden')
  }
  const collectionPage = await objectStorage.getCollectionPage(id, req.params.collection, req.params.n)
  const exported = await collectionPage.export()
  exported.items = await Promise.all(exported.items.filter((item) =>
    authorizer.canRead(remote, item)
  ))
  res.status(200)
  res.type(as2.mediaType)
  res.end(exported)
})
