import express from 'express'
import as2 from 'activitystrea.ms'
import createHttpError from 'http-errors'

const router = express.Router()

function isActivity (object) {
  return true
}

function getActor (activity) {
  return activity.actor?.first
}

router.post('/user/:username/inbox', as2.Middleware, async (req, res, next) => {
  const { username } = req.params
  const { bots, actorStorage, activityHandler } = req.app.locals
  const { subject } = req.auth

  if (!subject) {
    return next(createHttpError(401, 'Unauthorized'))
  }

  if (!req.body) {
    return next(createHttpError(400, 'Bad Request'))
  }

  const activity = req.body
  if (!isActivity(activity)) {
    return next(createHttpError(400, 'Bad Request'))
  }

  const actor = getActor(activity)

  if (actor?.id !== subject) {
    return next(createHttpError(403, 'Forbidden'))
  }

  const bot = bots[username]
  if (!bot) {
    return next(createHttpError(404, 'Not Found'))
  }

  if (await actorStorage.isInCollection(username, 'blocked', actor)) {
    return next(createHttpError(403, 'Forbidden'))
  }

  try {
    await activityHandler.handleActivity(bot, activity)
  } catch (err) {
    return next(err)
  }

  await actorStorage.addToCollection(bot.username, 'inbox', activity)

  res.status(200)
  res.type('text/plain')
  res.send('OK')
})

export default router
