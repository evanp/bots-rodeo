export class Authorizer {
  #actorStorage = null
  #formatter = null
  constructor (actorStorage, formatter) {
    this.#actorStorage = actorStorage
    this.#formatter = formatter
  }

  async canRead (actor, object) {
    const recipients = this.#getRecipients(object)
    if (!actor) {
      return recipients.includes('https://www.w3.org/ns/activitystreams#Public')
    }
    const owner = await this.getOwner(object)
    if (actor.id === owner.id) {
      return true
    }
    if (await this.#actorStorage.isInCollection(owner.preferredUsername, 'blocked', actor.id)) {
      return false
    }
    if (recipients.includes(actor.id)) {
      return true
    }
    if (recipients.includes('https://www.w3.org/ns/activitystreams#Public')) {
      return true
    }
    const followers = this.#formatter.format({ username: owner.preferredUsername, collection: 'followers' })
    if (recipients.includes(followers) && await this.#actorStorage.isInCollection(owner.preferredUsername, 'followers', actor.id)) {
      return true
    }
    return false
  }

  async isOwner (actor, object) {
    const owner = await this.getOwner(object)
    return actor.id === owner.id
  }

  async getOwner (object) {
    return object.attributedTo || object.actor || object.owner
  }

  async sameOrigin (actor, object) {
    return (new URL(actor.id)).origin === (new URL(object.id)).origin
  }

  #getRecipients (activity) {
    const recipientIds = new Set()
    if (activity.to) {
      for (const to of activity.to) {
        recipientIds.add(to.id)
      }
    }
    if (activity.cc) {
      for (const cc of activity.cc) {
        recipientIds.add(cc.id)
      }
    }
    if (activity.audience) {
      for (const audience of activity.audience) {
        recipientIds.add(audience.id)
      }
    }
    if (activity.bto) {
      for (const bto of activity.bto) {
        recipientIds.add(bto.id)
      }
    }
    if (activity.bcc) {
      for (const bcc of activity.bcc) {
        recipientIds.add(bcc.id)
      }
    }
    return recipientIds
  }
}
