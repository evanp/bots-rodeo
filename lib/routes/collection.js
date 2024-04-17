import express from 'express'
import as2 from 'activitystrea.ms'
import createHttpError from 'http-errors'

const router = express.Router()

router.get('/:username/:collection', async (req, res) => {
  const { actorStorage } = req.app.locals
  const outbox = await actorStorage.getCollection(req.params.username, 'outbox')
  res.status(200)
  res.type(as2.mediaType)
  res.end(await outbox.prettyWrite())
})

router.get('/:username/:collection/page/:n', async (req, res) => {
  if (!['outbox', 'liked', 'followers', 'following'].includes(req.params.collection)) {
    throw createHttpError(404, 'Not Found')
  }
  if (!(req.params.username in req.app.locals.bots)) {
    throw createHttpError(404, 'Not Found')
  }
  const id = req.auth?.subject
  const remote = (id) ? await as2.import({ id }) : null
  const { actorStorage, authorizer } = req.app.locals
  const outboxPage = await actorStorage.getCollectionPage(req.params.username, req.params.collection, req.params.n)
  const exported = await outboxPage.export()
  if (['outbox', 'liked'].includes(req.params.collection)) {
    exported.items = await Promise.all(exported.items.filter((item) =>
      authorizer.canRead(remote, item)
    ))
  }
  res.status(200)
  res.type(as2.mediaType)
  res.end(await exported)
})
