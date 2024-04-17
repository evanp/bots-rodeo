import express from 'express'
import as2 from 'activitystrea.ms'
import createHttpError from 'http-errors'

const router = express.Router()

function isActivity (object) {
  return true
}

router.get('/user/:username/inbox', async (req, res) => {
  throw createHttpError(403, 'forbidden')
})

router.post('/user/:username/inbox', as2.Middleware, async (req, res) => {
  if (!req.auth.subject) {
    throw createHttpError(401, 'Unauthorized')
  }
  if (!req.body) {
    throw createHttpError(400, 'Bad Request')
  }
  const activity = req.body
  if (!isActivity(activity)) {
    throw createHttpError(400, 'Bad Request')
  }
  if (activity.actor?.id !== req.auth.subject) {
    throw createHttpError(403, 'Forbidden')
  }
  const bot = req.app.locals.bots[req.params.username]
  if (!bot) {
    throw createHttpError(404, 'Not Found')
  }
  const actorStorage = req.app.locals.actorStorage
  if (actorStorage.isInCollection(bot.username, 'blocked', activity.actor.id)) {
    throw createHttpError(403, 'Forbidden')
  }
  await actorStorage.addToCollection(bot.username, 'inbox', activity)
  switch (activity.type) {
    case 'Create': await bot.handleCreate(activity); break
    case 'Update': await bot.handleUpdate(activity); break
    case 'Delete': await bot.handleDelete(activity); break
    case 'Add': await bot.handleAdd(activity); break
    case 'Remove': await bot.handleRemove(activity); break
    case 'Follow': await bot.handleFollow(activity); break
    case 'Accept': await bot.handleAccept(activity); break
    case 'Reject': await bot.handleReject(activity); break
    case 'Like': await bot.handleLike(activity); break
    case 'Announce': await bot.handleAnnounce(activity); break
    case 'Undo': await bot.handleUndo(activity); break
    case 'Block': await bot.handleBlock(activity); break
    case 'Flag': await bot.handleFlag(activity); break
    default:
      console.log(`Unhandled activity type: ${activity.type}`)
  }

  res.status(200)
  res.type('text/plain')
  res.send('OK')
})

export default router
