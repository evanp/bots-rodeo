import express from 'express'
import as2 from 'activitystrea.ms'
import createHttpError from 'http-errors'

const router = express.Router()

router.get('/user/:username', async (req, res, next) => {
  const { username } = req.params
  const { actorStorage, bots } = req.app.locals
  if (!(username in bots)) {
    return next(createHttpError(404, `User ${username} not found`))
  }
  const actor = await actorStorage.getActor(username)
  res.status(200)
  res.type(as2.mediaType)
  const body = await actor.prettyWrite(
    { additional_context: 'https://w3id.org/security/v1' }
  )
  res.end(body)
})

export default router
