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
    this.#logger = logger
    this.#botId = this.#formatter.format({ username: this.username })
    this.#botActor = this.#actorStorage.getActor(this.username)
  }

  async handleCreate (activity) {
    const actor = activity.actor?.first
    if (!actor) {
      this.#logger.warn(
        'Create activity has no actor',
        { activity: activity.id }
      )
      return
    }
    const object = activity.object?.first
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
      const original = await this.#objectStorage.read(inReplyTo.id)
      if (!original) {
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
    const actor = activity.actor
    const object = activity.object
    if (await this.#authz.sameOrigin(actor, object)) {
      await this.#cache.save(object)
    } else {
      await this.#cache.saveReceived(object)
    }
  }

  async handleDelete (activity) {
    const actor = activity.actor
    const object = activity.object
    if (await this.#authz.sameOrigin(actor, object)) {
      await this.#cache.save(object)
    } else {
      await this.#cache.clear(object)
    }
  }

  async handleAdd (activity) {
    const actor = activity.actor
    const target = activity.target
    const object = activity.object
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
    const actor = activity.actor
    const target = activity.target
    const object = activity.object
    if (await this.#authz.sameOrigin(actor, object)) {
      await this.#cache.save(object)
    } else {
      await this.#cache.saveReceived(object)
    }
    if (await this.#authz.sameOrigin(actor, target)) {
      await this.#cache.save(target)
    } else {
      await this.#cache.saveReceived(target)
    }
    await this.#cache.clearMembership(target, object)
  }

  async handleFollow (activity) {
    const actor = activity.actor
    if (this.#actorStorage.isInCollection(this.username, 'followers', actor)) {
      return
    }
    if (this.#actorStorage.isInCollection(this.username, 'blocked', actor)) {
      return
    }
    this.#actorStorage.addToCollection(this.username, 'followers', actor)
    const accept = as2.import({
      type: 'Accept',
      actor: this.#formatter.format({ username: this.username }),
      object: activity,
      to: actor
    })
    this.#distributor.distribute(accept, this.username)
  }

  async handleAccept (activity) {
    const actor = activity.actor
    const followActivity = activity.object
    if (followActivity.type !== 'Follow') {
      return
    }
    if (this.#actorStorage.isInCollection(this.username, 'following', actor)) {
      return
    }
    if (
      !this.#actorStorage.isInCollection(
        this.username,
        'pendingFollowing',
        followActivity
      )
    ) {
      return
    }
    if (this.#actorStorage.isInCollection(this.username, 'blocked', actor)) {
      return
    }
    this.#actorStorage.addToCollection(this.username, 'following', actor)
    this.#actorStorage.removeFromCollection(
      this.username,
      'pendingFollowing',
      followActivity
    )
  }

  async handleReject (activity) {
    const followActivity = activity.object
    if (followActivity.type !== 'Follow') {
      return
    }
    if (
      !this.#actorStorage.isInCollection(
        this.username,
        'pendingFollowing',
        followActivity
      )
    ) {
      return
    }
    this.#actorStorage.removeFromCollection(
      this.username,
      'pendingFollowing',
      followActivity
    )
  }

  async handleLike (activity) {
    const actor = activity.actor
    const object = activity.object
    if (!(await this.#authz.canRead(actor, object))) {
      return
    }
    if (this.#objectStorage.isInCollection(object, 'likes', activity)) {
      return
    }
    this.#objectStorage.addToCollection(object, 'likes', activity)
  }

  async handleAnnounce (activity) {
    const actor = activity.actor
    const object = activity.object
    if (!(await this.#authz.canRead(actor, object))) {
      return
    }
    if (this.#objectStorage.isInCollection(object, 'shares', activity)) {
      return
    }
    this.#objectStorage.addToCollection(object, 'shares', activity)
  }

  async handleUndo (activity) {
    const object = activity.object
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

  async handleBlock (activity) {
    const actor = activity.actor
    const object = activity.object
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

  async handleFlag (activity) {
    const actor = activity.actor
    const object = activity.object
    console.warn(`Actor ${actor.id} flagged object ${object.id} for review.`)
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
}
