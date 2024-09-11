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
  const { bots, actorStorage, activityHandler, logger } = req.app.locals
  const { subject } = req.auth

  logger.debug({ username, msg: 'received activity' })

  if (!subject) {
    return next(createHttpError(401, 'Unauthorized'))
  }

  logger.debug({ username, msg: 'checking body' })
  if (!req.body) {
    return next(createHttpError(400, 'Bad Request'))
  }

  logger.debug({ username, msg: 'checking if it is an activity' })

  const activity = req.body
  if (!isActivity(activity)) {
    return next(createHttpError(400, 'Bad Request'))
  }

  const actor = getActor(activity)

  logger.debug({ username, subject, actor: actor?.id, msg: 'checking actor' })

  if (actor?.id !== subject) {
    return next(createHttpError(403, 'Forbidden'))
  }

  logger.debug({ username, msg: 'checking bot' })

  const bot = bots[username]
  if (!bot) {
    return next(createHttpError(404, 'Not Found'))
  }

  logger.debug({ username, msg: 'checking for a block' })

  if (await actorStorage.isInCollection(username, 'blocked', actor)) {
    return next(createHttpError(403, 'Forbidden'))
  }

  logger.debug({ username, msg: 'handling activity' })

  try {
    await activityHandler.handleActivity(bot, activity)
  } catch (err) {
    return next(err)
  }

  logger.debug({ username, msg: 'adding to inbox' })

  await actorStorage.addToCollection(bot.username, 'inbox', activity)

  logger.debug({ username, msg: 'showing results' })

  res.status(200)
  res.type('text/plain')
  res.send('OK')
})

export default router
