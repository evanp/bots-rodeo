import as2 from 'activitystrea.ms'
import { nanoid } from 'nanoid'

export class BotFacade {
  username = null
  bot = null
  #actorStorage = null
  #objectStorage = null
  #distributor = null
  #cache = null
  #formatter = null
  #authz = null
  #logger = null
  #botId = null
  #botActor = null
  constructor (
    username,
    bot,
    actorStorage,
    objectStorage,
    distributor,
    formatter,
    cache,
    authz,
    logger
  ) {
    this.username = username
    this.bot = bot
    this.#actorStorage = actorStorage
    this.#objectStorage = objectStorage
    this.#distributor = distributor
    this.#formatter = formatter
    this.#cache = cache
    this.#authz = authz
    this.#logger = logger.child({ username })
    this.#botId = this.#formatter.format({ username: this.username })
    this.#botActor = this.#actorStorage.getActor(this.username)
  }

  async handleCreate (activity) {
    const actor = this.#getActor(activity)
    if (!actor) {
      this.#logger.warn(
        'Create activity has no actor',
        { activity: activity.id }
      )
      return
    }
    const object = this.#getObject(activity)
    if (!object) {
      this.#logger.warn(
        'Create activity has no object',
        { activity: activity.id }
      )
      return
    }
    if (await this.#authz.sameOrigin(activity, object)) {
      await this.#cache.save(object)
    } else {
      await this.#cache.saveReceived(object)
    }
    const inReplyTo = object.inReplyTo?.first
    if (
      inReplyTo &&
      this.#formatter.isLocal(inReplyTo.id)
    ) {
      let original = null
      try {
        original = await this.#objectStorage.read(inReplyTo.id)
      } catch (err) {
        this.#logger.warn(
          'Create activity references not found original object',
          { activity: activity.id, original: inReplyTo.id }
        )
        return
      }
      if (this.#authz.isOwner(this.#botActor, original)) {
        if (!await this.#authz.canRead(actor, original)) {
          this.#logger.warn(
            'Create activity references inaccessible original object',
            { activity: activity.id, original: original.id }
          )
          return
        }
        if (await this.#objectStorage.isInCollection(original.id, 'replies', object)) {
          this.#logger.warn(
            'Create activity object already in replies collection',
            {
              activity: activity.id,
              object: object.id,
              original: original.id
            }
          )
          return
        }
        await this.#objectStorage.addToCollection(
          original.id,
          'replies',
          object
        )
        const recipients = this.#getRecipients(original)
        this.#addRecipient(recipients, actor, 'to')
        await this.#doActivity(await as2.import({
          type: 'Add',
          id: this.#formatter.format({
            username: this.username,
            type: 'add',
            nanoid: nanoid()
          }),
          actor: original.actor,
          object,
          target: original.replies,
          ...recipients
        }))
      }
    }
  }

  async handleUpdate (activity) {
    const object = this.#getObject(activity)
    if (await this.#authz.sameOrigin(activity, object)) {
      await this.#cache.save(object)
    } else {
      await this.#cache.saveReceived(object)
    }
  }

  async handleDelete (activity) {
    const object = this.#getObject(activity)
    await this.#cache.clear(object)
  }

  async handleAdd (activity) {
    const actor = this.#getActor(activity)
    const target = this.#getTarget(activity)
    const object = this.#getObject(activity)
    if (await this.#authz.sameOrigin(actor, object)) {
      await this.#cache.save(object)
    } else {
      await this.#cache.saveReceived(object)
    }
    if (await this.#authz.sameOrigin(actor, target)) {
      await this.#cache.save(target)
      await this.#cache.saveMembership(target, object)
    } else {
      await this.#cache.saveReceived(target)
      await this.#cache.saveMembershipReceived(target, object)
    }
  }

  async handleRemove (activity) {
    const actor = this.#getActor(activity)
    const target = this.#getTarget(activity)
    const object = this.#getObject(activity)
    if (await this.#authz.sameOrigin(actor, object)) {
      await this.#cache.save(object)
    } else {
      await this.#cache.saveReceived(object)
    }
    if (await this.#authz.sameOrigin(actor, target)) {
      await this.#cache.save(target)
      await this.#cache.saveMembership(target, object, false)
    } else {
      await this.#cache.saveReceived(target)
      await this.#cache.saveMembershipReceived(target, object, false)
    }
  }

  async handleFollow (activity) {
    const actor = this.#getActor(activity)
    const object = this.#getObject(activity)
    if (object.id !== this.#botId) {
      this.#logger.warn({
        msg: 'Follow activity object is not the bot',
        activity: activity.id,
        object: object.id
      })
      return
    }
    if (await this.#actorStorage.isInCollection(this.username, 'blocked', actor)) {
      this.#logger.warn({
        msg: 'Follow activity from blocked actor',
        activity: activity.id,
        actor: actor.id
      })
      return
    }
    if (await this.#actorStorage.isInCollection(this.username, 'followers', actor)) {
      this.#logger.warn({
        msg: 'Duplicate follow activity',
        activity: activity.id,
        actor: actor.id
      })
      return
    }
    this.#logger.info({
      msg: 'Adding follower',
      actor: actor.id
    })
    await this.#actorStorage.addToCollection(this.username, 'followers', actor)
    this.#logger.info(
      'Sending accept',
      { actor: actor.id }
    )
    const addActivityId = this.#formatter.format({
      username: this.username,
      type: 'add',
      nanoid: nanoid()
    })
    await this.#doActivity(await as2.import({
      id: addActivityId,
      type: 'Add',
      actor: this.#formatter.format({ username: this.username }),
      object: actor,
      target: this.#formatter.format({
        username: this.username,
        collection: 'followers'
      }),
      to: ['as:Public', actor.id]
    }))
    await this.#doActivity(await as2.import({
      id: this.#formatter.format({
        username: this.username,
        type: 'accept',
        nanoid: nanoid()
      }),
      type: 'Accept',
      actor: this.#formatter.format({ username: this.username }),
      object: activity,
      to: actor
    }))
  }

  async handleAccept (activity) {
    let objectActivity = this.#getObject(activity)
    if (!this.#formatter.isLocal(objectActivity.id)) {
      this.#logger.warn({ msg: 'Accept activity for a non-local activity' })
      return
    }
    try {
      objectActivity = await this.#objectStorage.read(objectActivity.id)
    } catch (err) {
      this.#logger.warn({ msg: 'Accept activity object not found' })
      return
    }
    switch (objectActivity.type) {
      case 'https://www.w3.org/ns/activitystreams#Follow':
        await this.#handleAcceptFollow(activity, objectActivity)
        break
      default:
        console.log('Unhandled accept', objectActivity.type)
        break
    }
  }

  async #handleAcceptFollow (activity, followActivity) {
    const actor = this.#getActor(activity)
    if (
      !(await this.#actorStorage.isInCollection(
        this.username,
        'pendingFollowing',
        followActivity
      ))
    ) {
      this.#logger.warn({ msg: 'Accept activity object not found' })
      return
    }
    if (await this.#actorStorage.isInCollection(this.username, 'following', actor)) {
      this.#logger.warn({ msg: 'Already following' })
      return
    }
    if (await this.#actorStorage.isInCollection(this.username, 'blocked', actor)) {
      this.#logger.warn({ msg: 'blocked' })
      return
    }
    const object = this.#getObject(followActivity)
    if (object.id !== actor.id) {
      this.#logger.warn({ msg: 'Object does not match actor' })
      return
    }
    this.#logger.info({ msg: 'Adding to following' })
    await this.#actorStorage.addToCollection(this.username, 'following', actor)
    await this.#actorStorage.removeFromCollection(
      this.username,
      'pendingFollowing',
      followActivity
    )
  }

  async handleReject (activity) {
    let objectActivity = this.#getObject(activity)
    if (!this.#formatter.isLocal(objectActivity.id)) {
      this.#logger.warn({ msg: 'Reject activity for a non-local activity' })
      return
    }
    try {
      objectActivity = await this.#objectStorage.read(objectActivity.id)
    } catch (err) {
      this.#logger.warn({ msg: 'Reject activity object not found' })
      return
    }
    switch (objectActivity.type) {
      case 'https://www.w3.org/ns/activitystreams#Follow':
        await this.#handleRejectFollow(activity, objectActivity)
        break
      default:
        this.#logger.warn({ msg: 'Unhandled reject' })
        break
    }
  }

  async #handleRejectFollow (activity, followActivity) {
    const actor = this.#getActor(activity)
    if (
      !(await this.#actorStorage.isInCollection(
        this.username,
        'pendingFollowing',
        followActivity
      ))
    ) {
      this.#logger.warn({ msg: 'Reject activity object not found' })
      return
    }
    if (await this.#actorStorage.isInCollection(this.username, 'following', actor)) {
      this.#logger.warn({ msg: 'Already following' })
      return
    }
    if (await this.#actorStorage.isInCollection(this.username, 'blocked', actor)) {
      this.#logger.warn({ msg: 'blocked' })
      return
    }
    const object = this.#getObject(followActivity)
    if (object.id !== actor.id) {
      this.#logger.warn({ msg: 'Object does not match actor' })
      return
    }
    this.#logger.info({ msg: 'Removing from pending' })
    await this.#actorStorage.removeFromCollection(
      this.username,
      'pendingFollowing',
      followActivity
    )
  }

  async handleLike (activity) {
    const actor = this.#getActor(activity)
    let object = this.#getObject(activity)
    if (!this.#formatter.isLocal(object.id)) {
      this.#logger.warn({
        msg: 'Like activity object is not local',
        activity: activity.id,
        object: object.id
      })
      return
    }
    try {
      object = await this.#objectStorage.read(object.id)
    } catch (err) {
      this.#logger.warn({
        msg: 'Like activity object not found',
        activity: activity.id,
        object: object.id
      })
      return
    }
    if (!(await this.#authz.canRead(actor, object))) {
      this.#logger.warn({
        msg: 'Like activity object is not readable',
        activity: activity.id,
        object: object.id
      })
      return
    }
    const owner = this.#getOwner(object)
    if (!owner || owner.id !== this.#botId) {
      this.#logger.warn({
        msg: 'Like activity object is not owned by bot',
        activity: activity.id,
        object: object.id
      })
      return
    }
    if (await this.#objectStorage.isInCollection(object.id, 'likes', activity)) {
      this.#logger.warn({
        msg: 'Like activity already in likes collection',
        activity: activity.id,
        object: object.id
      })
      return
    }
    if (await this.#objectStorage.isInCollection(object.id, 'likers', actor)) {
      this.#logger.warn({
        msg: 'Actor already in likers collection',
        activity: activity.id,
        actor: actor.id,
        object: object.id
      })
      return
    }
    await this.#objectStorage.addToCollection(object.id, 'likes', activity)
    await this.#objectStorage.addToCollection(object.id, 'likers', actor)
    const recipients = this.#getRecipients(object)
    this.#addRecipient(recipients, actor, 'to')
    await this.#doActivity(await as2.import({
      type: 'Add',
      id: this.#formatter.format({
        username: this.username,
        type: 'add',
        nanoid: nanoid()
      }),
      actor: this.#botId,
      object: activity,
      target: this.#formatter.format({
        username: this.username,
        collection: 'likes'
      }),
      ...recipients
    }))
  }

  async handleAnnounce (activity) {
    const actor = this.#getActor(activity)
    let object = this.#getObject(activity)
    if (!this.#formatter.isLocal(object.id)) {
      this.#logger.warn({
        msg: 'Announce activity object is not local',
        activity: activity.id,
        object: object.id
      })
      return
    }
    try {
      object = await this.#objectStorage.read(object.id)
    } catch (err) {
      this.#logger.warn({
        msg: 'Announce activity object not found',
        activity: activity.id,
        object: object.id
      })
      return
    }
    const owner = this.#getOwner(object)
    if (!owner || owner.id !== this.#botId) {
      this.#logger.warn({
        msg: 'Announce activity object is not owned by bot',
        activity: activity.id,
        object: object.id
      })
      return
    }
    if (!(await this.#authz.canRead(actor, object))) {
      this.#logger.warn({
        msg: 'Announce activity object is not readable',
        activity: activity.id,
        object: object.id
      })
      return
    }
    if (await this.#objectStorage.isInCollection(object.id, 'shares', activity)) {
      this.#logger.warn({
        msg: 'Announce activity already in shares collection',
        activity: activity.id,
        object: object.id
      })
      return
    }
    if (await this.#objectStorage.isInCollection(object.id, 'sharers', actor)) {
      this.#logger.warn({
        msg: 'Actor already in sharers collection',
        activity: activity.id,
        actor: actor.id,
        object: object.id
      })
      return
    }
    await this.#objectStorage.addToCollection(object.id, 'shares', activity)
    await this.#objectStorage.addToCollection(object.id, 'sharers', actor)
    const recipients = this.#getRecipients(object)
    this.#addRecipient(recipients, actor, 'to')
    await this.#doActivity(await as2.import({
      type: 'Add',
      id: this.#formatter.format({
        username: this.username,
        type: 'add',
        nanoid: nanoid()
      }),
      actor: this.#botId,
      object: activity,
      target: this.#formatter.format({
        username: this.username,
        collection: 'shares'
      }),
      ...recipients
    }))
  }

  async handleBlock (activity) {
    const actor = this.#getActor(activity)
    const object = this.#getObject(activity)
    if (object.id === this.#formatter.format({ username: this.bot.username })) {
      // These skip if not found
      await this.#actorStorage.removeFromCollection(
        this.username,
        'followers',
        actor
      )
      await this.#actorStorage.removeFromCollection(
        this.username,
        'following',
        actor
      )
      await this.#actorStorage.removeFromCollection(
        this.username,
        'pendingFollowing',
        actor
      )
      await this.#actorStorage.removeFromCollection(
        this.username,
        'pendingFollowers',
        actor
      )
    }
  }

  async handleFlag (activity) {
    const actor = this.#getActor(activity)
    const object = this.#getObject(activity)
    console.warn(`Actor ${actor.id} flagged object ${object.id} for review.`)
  }

  async handleUndo (activity) {
    const object = this.#getObject(activity)
    switch (object.type) {
      case 'Like':
        await this.handleUndoLike(activity)
        break
      case 'Announce':
        await this.handleUndoAnnounce(activity)
        break
      case 'Block':
        await this.handleUndoBlock(activity)
        break
      case 'Follow':
        await this.handleUndoFollow(activity)
        break
      default:
        break
    }
  }

  async handleUndoLike (undoActivity) {
    const actor = undoActivity.actor
    const likeActivity = undoActivity.object
    const object = likeActivity.object
    if (!this.#formatter.isLocal(object)) {
      return
    }
    if (!(await this.#authz.canRead(actor, object))) {
      return
    }
    this.#objectStorage.removeFromCollection(object, 'likes', likeActivity)
  }

  async handleUndoAnnounce (undoActivity) {
    const actor = undoActivity.actor
    const shareActivity = undoActivity.object
    const object = shareActivity.object
    if (!this.#formatter.isLocal(object)) {
      return
    }
    if (!(await this.#authz.canRead(actor, object))) {
      return
    }
    this.#objectStorage.removeFromCollection(object, 'shares', shareActivity)
  }

  async handleUndoBlock (activity) {
  }

  async handleUndoFollow (undoActivity) {
    const actor = undoActivity.actor
    const followActivity = undoActivity.object
    if (followActivity.actor.id !== actor.id) {
      return
    }
    if (await this.#actorStorage.isInCollection(this.username, 'followers', actor)) {
      await this.#actorStorage.removeFromCollection(this.username, 'followers', actor)
    }
  }

  async onIdle () {
    await this.#distributor.onIdle()
  }

  #getRecipients (obj) {
    const to = obj.to ? Array.from(obj.to).map((to) => to.id) : null
    const cc = obj.cc ? Array.from(obj.cc).map((cc) => cc.id) : null
    const bto = obj.bto ? Array.from(obj.bto).map((bto) => bto.id) : null
    const bcc = obj.bcc ? Array.from(obj.bcc).map((bcc) => bcc.id) : null
    const audience = obj.audience
      ? Array.from(obj.audience).map((audience) => audience.id)
      : null
    return { to, cc, bto, bcc, audience }
  }

  #removeRecipient (recipients, actor) {
    const remove = (list) => {
      if (!list) {
        return
      }
      const index = list.indexOf(actor.id)
      if (index !== -1) {
        list.splice(index, 1)
      }
    }
    remove(recipients.to)
    remove(recipients.cc)
    remove(recipients.bto)
    remove(recipients.bcc)
    remove(recipients.audience)
  }

  #addRecipient (recipients, actor, key = 'to') {
    if (!actor.id) {
      return
    }
    if (!recipients[key]) {
      recipients[key] = []
    }
    if (recipients[key].indexOf(actor.id) === -1) {
      recipients[key].push(actor.id)
    }
  }

  async #doActivity (activity) {
    await this.#objectStorage.create(activity)
    await this.#actorStorage.addToCollection(this.username, 'outbox', activity)
    await this.#actorStorage.addToCollection(this.username, 'inbox', activity)
    await this.#distributor.distribute(activity, this.username)
  }

  #getActor (activity) {
    return activity.actor?.first
  }

  #getObject (activity) {
    return activity.object?.first
  }

  #getTarget (activity) {
    return activity.target?.first
  }

  #getOwner (object) {
    if (object.attributedTo) {
      return object.attributedTo.first
    } else if (object.actor) {
      return object.actor.first
    } else if (object.owner) {
      return object.owner.first
    } else {
      return null
    }
  }
}
