import as2 from 'activitystrea.ms'

export class BotFacade {
  username = null
  bot = null
  #actorStorage = null
  #objectStorage = null
  #distributor = null
  #cache = null
  #formatter = null
  #authz = null

  constructor (
    username,
    bot,
    actorStorage,
    objectStorage,
    distributor,
    formatter,
    cache,
    authz
  ) {
    this.username = username
    this.bot = bot
    this.#actorStorage = actorStorage
    this.#objectStorage = objectStorage
    this.#distributor = distributor
    this.#formatter = formatter
    this.#cache = cache
    this.#authz = authz
  }

  async handleCreate (activity) {
    const actor = activity.actor
    const object = activity.object
    if (await this.#authz.sameOrigin(activity, object)) {
      await this.#cache.save(object)
    } else {
      await this.#cache.saveReceived(object)
    }
    if (
      object.inReplyTo &&
      this.#formatter.isLocal(object.inReplyTo) &&
      !this.#objectStorage.isInCollection(object.inReplyTo, 'replies') &&
      (await this.#authz.canRead(actor, object.inReplyTo))
    ) {
      const original = await this.#objectStorage.get(object.inReplyTo.id)
      this.#objectStorage.addToCollection(original, 'replies', object)
      const recipients = this.#getRecipients(original)
      const add = as2.import({
        type: 'Add',
        actor: original.actor,
        object,
        target: original.replies,
        ...recipients
      })
      this.#distributor.distribute(add, this.username)
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
}
